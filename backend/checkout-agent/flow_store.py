"""
Flow Store — Per-domain checkout flow persistence

Saves learned checkout flows (navigation steps, selectors, URLs) as JSON files.
On repeat visits, the agent replays navigation with ZERO LLM calls and uses
saved selectors for instant form filling.

Storage: ./flows/<domain>.json

Flow schema:
{
    "domain": "mediamarkt.nl",
    "platform": "unknown",
    "checkout_url_pattern": "/checkout/",
    "navigation_steps": [
        { "action": "click", "text": "Alles accepteren", "selector": "#pwa-consent-layer-ac", ... },
        { "action": "click", "text": "In winkelwagen", ... },
        ...
    ],
    "form_selectors": { "email": "[autocomplete=\"email\"]", ... },
    "payment_selectors": { "card_number": "[autocomplete=\"cc-number\"]", ... },
    "success_count": 3,
    "last_success": "2026-02-17T12:00:00Z"
}

Learning loop:
  Visit 1: LLM navigates everything → record all clicks → save flow
  Visit 2: Replay navigation (0 LLM) → saved selectors fill forms (0 LLM) → LLM only for edge cases
  Visit N: Entire checkout in ~30 seconds with near-zero LLM cost
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger('flow_store')

FLOWS_DIR = os.path.join(os.path.dirname(__file__), 'flows')


def _domain_from_url(url: str) -> str:
    """Extract domain from a URL."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    domain = parsed.hostname or ''
    if domain.startswith('www.'):
        domain = domain[4:]
    return domain


def _flow_path(domain: str) -> str:
    """Get the file path for a domain's flow."""
    os.makedirs(FLOWS_DIR, exist_ok=True)
    safe_domain = domain.replace('/', '_').replace(':', '_')
    return os.path.join(FLOWS_DIR, f"{safe_domain}.json")


def load_flow(domain_or_url: str) -> Optional[dict]:
    """Load a saved flow for a domain."""
    domain = _domain_from_url(domain_or_url) if '/' in domain_or_url else domain_or_url
    path = _flow_path(domain)
    
    if not os.path.exists(path):
        logger.info(f"📭 No saved flow for '{domain}'")
        return None
    
    try:
        with open(path, 'r') as f:
            flow = json.load(f)
        
        nav_count = len(flow.get('navigation_steps', []))
        form_count = len(flow.get('form_selectors', {}))
        pay_count = len(flow.get('payment_selectors', {}))
        
        logger.info(
            f"📬 Loaded flow for '{domain}' — "
            f"{nav_count} nav steps, "
            f"{form_count} form selectors, "
            f"{pay_count} payment selectors, "
            f"{flow.get('success_count', 0)} prior successes"
        )
        return flow
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"⚠️ Failed to load flow for '{domain}': {e}")
        return None


def save_flow(
    domain_or_url: str,
    form_selectors: dict,
    payment_selectors: dict = None,
    navigation_steps: list = None,
    checkout_url_pattern: str = None,
    platform: str = None,
    final_url: str = None,
):
    """
    Save (or update) a checkout flow for a domain.
    Merges selectors. Navigation steps are REPLACED (not merged) since
    they represent a complete sequence.
    """
    domain = _domain_from_url(domain_or_url) if '/' in domain_or_url else domain_or_url
    path = _flow_path(domain)
    
    existing = {}
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                existing = json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    
    # Merge selectors (new wins on conflict)
    merged_form = {**existing.get('form_selectors', {}), **form_selectors}
    merged_payment = {**existing.get('payment_selectors', {}), **(payment_selectors or {})}
    
    # Navigation steps: use new if provided, otherwise keep existing
    nav_steps = navigation_steps if navigation_steps is not None else existing.get('navigation_steps', [])
    
    flow = {
        'domain': domain,
        'platform': platform or existing.get('platform', 'unknown'),
        'checkout_url_pattern': checkout_url_pattern or existing.get('checkout_url_pattern'),
        'navigation_steps': nav_steps,
        'form_selectors': merged_form,
        'payment_selectors': merged_payment,
        'success_count': existing.get('success_count', 0) + 1,
        'failure_count': existing.get('failure_count', 0),  # Preserve failure count
        'consecutive_failures': 0,  # Reset on success
        'last_success': datetime.now(timezone.utc).isoformat(),
        'last_url': final_url or existing.get('last_url'),
    }
    
    try:
        os.makedirs(FLOWS_DIR, exist_ok=True)
        with open(path, 'w') as f:
            json.dump(flow, f, indent=2)
        
        logger.info(
            f"💾 Saved flow for '{domain}' — "
            f"{len(nav_steps)} nav steps, "
            f"{len(merged_form)} form selectors, "
            f"{len(merged_payment)} payment selectors "
            f"(visit #{flow['success_count']})"
        )
    except IOError as e:
        logger.error(f"❌ Failed to save flow for '{domain}': {e}")


def delete_flow(domain_or_url: str) -> bool:
    """Delete a saved flow for a domain."""
    domain = _domain_from_url(domain_or_url) if '/' in domain_or_url else domain_or_url
    path = _flow_path(domain)
    if os.path.exists(path):
        os.remove(path)
        logger.info(f"🗑️ Deleted flow for '{domain}'")
        return True
    return False


def list_flows() -> list:
    """List all saved flows."""
    if not os.path.exists(FLOWS_DIR):
        return []
    
    flows = []
    for filename in os.listdir(FLOWS_DIR):
        if not filename.endswith('.json'):
            continue
        try:
            with open(os.path.join(FLOWS_DIR, filename), 'r') as f:
                flow = json.load(f)
            flows.append({
                'domain': flow.get('domain', filename.replace('.json', '')),
                'platform': flow.get('platform', 'unknown'),
                'success_count': flow.get('success_count', 0),
                'last_success': flow.get('last_success'),
                'nav_steps': len(flow.get('navigation_steps', [])),
                'form_fields': len(flow.get('form_selectors', {})),
                'payment_fields': len(flow.get('payment_selectors', {})),
            })
        except (json.JSONDecodeError, IOError):
            continue
    
    return flows


# ═══════════════════════════════════════════════════════════════════
# EXTRACT NAVIGATION STEPS FROM AGENT HISTORY
# ═══════════════════════════════════════════════════════════════════

def extract_navigation_steps(history) -> list:
    """
    Extract replayable NAVIGATION steps from a browser-use agent's history.
    
    Only keeps steps that help navigate to/through checkout:
    - Cookie consent clicks
    - Add to cart clicks  
    - Checkout / Continue / Guest buttons
    - Payment method selection
    - Address confirmation
    - Page navigations
    
    Skips:
    - Form input actions (handled by form fill tools)
    - Empty/unidentifiable clicks
    - Custom tool calls (fill_shipping_form, fill_payment_form)
    - Duplicate consecutive clicks on same element
    """
    steps = []
    
    try:
        actions = history.model_actions()
        urls = history.urls()
    except Exception as e:
        logger.warning(f"Could not extract actions from history: {e}")
        return steps
    
    seen_selectors = set()  # Deduplicate
    
    for i, action in enumerate(actions):
        url = urls[i] if i < len(urls) else None
        
        # Skip custom tool calls
        action_keys = [k for k in action.keys() if k not in ('interacted_element', 'result')]
        if any(k in ('fill_shipping_form', 'fill_payment_form', 'done') for k in action_keys):
            continue
        
        interacted = action.get('interacted_element')
        
        # ── CLICK actions — only keep navigation clicks ──────────
        if 'click' in action:
            if not interacted:
                continue
            
            step = _build_step_from_element('click', interacted, url)
            if not step:
                continue
            
            purpose = step.get('purpose', 'other')
            text = step.get('text', '')
            selector = step.get('selector', '')
            tag = step.get('tag', '')
            
            # SKIP: empty clicks (no text, no useful purpose)
            if not text and purpose == 'other':
                continue
            
            # SKIP: generic styled spans with no useful text
            if tag == 'span' and purpose == 'other':
                continue
            
            # SKIP: form-related clicks (clicking into input fields)
            if tag in ('input', 'textarea', 'select'):
                continue
            
            # SKIP: already seen the same selector (dedup)
            dedup_key = f"{selector}:{text[:20]}"
            if dedup_key in seen_selectors:
                continue
            seen_selectors.add(dedup_key)
            
            steps.append(step)
        
        # ── NAVIGATE actions ─────────────────────────────────────
        elif 'go_to_url' in action or 'navigate' in action:
            nav_data = action.get('go_to_url') or action.get('navigate', {})
            nav_url = nav_data.get('url') if isinstance(nav_data, dict) else str(nav_data)
            if nav_url:
                steps.append({
                    'action': 'navigate',
                    'url': nav_url,
                    'purpose': 'navigation',
                })
        
        # ── WAIT actions — only keep short ones ──────────────────
        elif 'wait' in action:
            wait_data = action.get('wait', {})
            seconds = wait_data.get('seconds', 2) if isinstance(wait_data, dict) else 2
            steps.append({
                'action': 'wait',
                'seconds': min(seconds, 2),  # Cap at 2s for speed
                'purpose': 'page_load',
            })
        
        # ── GO BACK ──────────────────────────────────────────────
        elif 'go_back' in action:
            steps.append({'action': 'go_back', 'purpose': 'navigation'})
        
        # ── INPUT actions — SKIP (handled by form tools) ─────────
        # We don't record input actions. Form filling is done by
        # the JS tools with saved selectors, not by replaying inputs.
    
    logger.info(f"📋 Extracted {len(steps)} navigation steps from agent history")
    return steps


def _build_step_from_element(action_type: str, element, url: str = None) -> Optional[dict]:
    """Build a replayable step from a DOMInteractedElement."""
    if element is None:
        return None
    
    attrs = element.attributes or {}
    text = element.ax_name or ''
    tag = element.node_name or ''
    
    # Build robust CSS selector from attributes
    selector = _build_selector(tag, attrs)
    
    # Skip elements without any useful identifier
    if not selector and not text:
        return None
    
    step = {
        'action': action_type,
        'text': text[:100] if text else '',  # Truncate long text
        'selector': selector,
        'tag': tag.lower() if tag else '',
        'url_at': url,
        'purpose': _guess_purpose(text, attrs, url),
    }
    
    # Add aria-label if available (very robust identifier)
    if attrs.get('aria-label'):
        step['aria_label'] = attrs['aria-label'][:100]
    
    # Add role if available
    if attrs.get('role'):
        step['role'] = attrs['role']
    
    return step


def _build_selector(tag: str, attrs: dict) -> Optional[str]:
    """Build the most robust CSS selector from element attributes."""
    tag = tag.lower() if tag else ''
    
    # Priority 1: ID (most reliable)
    if attrs.get('id'):
        return f"#{attrs['id']}"
    
    # Priority 2: name attribute
    if attrs.get('name') and tag:
        return f'{tag}[name="{attrs["name"]}"]'
    
    # Priority 3: data-testid or data-test
    for data_attr in ['data-testid', 'data-test', 'data-cy']:
        if attrs.get(data_attr):
            return f'[{data_attr}="{attrs[data_attr]}"]'
    
    # Priority 4: aria-label (good for buttons)
    if attrs.get('aria-label'):
        return f'[aria-label="{attrs["aria-label"]}"]'
    
    # Priority 5: class + tag (less reliable but ok)
    if attrs.get('class') and tag:
        # Use the first specific-looking class
        classes = attrs['class'].split()
        specific = [c for c in classes if len(c) > 3 and not c.startswith('_')]
        if specific:
            return f'{tag}.{specific[0]}'
    
    return None


def _guess_purpose(text: str, attrs: dict, url: str = None) -> str:
    """Guess what this step does for human-readable logging."""
    text_lower = (text or '').lower()
    
    # Cookie consent
    if any(w in text_lower for w in ['accept', 'accepteren', 'cookie', 'consent', 'agree']):
        return 'cookie_consent'
    
    # Add to cart
    if any(w in text_lower for w in ['add to cart', 'in winkelwagen', 'bestellen', 'buy', 'kopen', 'wil bestellen']):
        return 'add_to_cart'
    
    # Go to cart / checkout
    if any(w in text_lower for w in ['checkout', 'kassa', 'winkelwagen', 'cart', 'verder naar bestellen', 'ga bestellen']):
        return 'go_to_checkout'
    
    # Guest checkout
    if any(w in text_lower for w in ['guest', 'zonder registratie', 'zonder account', 'continue without']):
        return 'guest_checkout'
    
    # Continue / Next
    if any(w in text_lower for w in ['verder', 'continue', 'next', 'doorgaan', 'volgende']):
        return 'continue'
    
    # Confirm
    if any(w in text_lower for w in ['bevestigen', 'confirm', 'accept']):
        return 'confirm'
    
    # Close popup
    if any(w in text_lower for w in ['close', 'sluiten', 'dismiss', '×']):
        return 'close_popup'
    
    # Payment
    if any(w in text_lower for w in ['creditcard', 'credit card', 'betalen', 'pay']):
        return 'select_payment'
    
    return 'other'


def _guess_field_purpose(element) -> str:
    """Guess what form field this input is for."""
    attrs = element.attributes or {}
    name = (attrs.get('name') or '').lower()
    
    if 'postal' in name or 'zip' in name or 'postcode' in name:
        return 'postcode'
    if 'house' in name or 'huisnummer' in name:
        return 'house_number'
    if 'street' in name or 'straat' in name:
        return 'street'
    if 'city' in name or 'stad' in name or 'plaats' in name:
        return 'city'
    if 'password' in name or 'wachtwoord' in name:
        return 'password'
    
    return 'unknown'


# ═══════════════════════════════════════════════════════════════════
# SELECTOR HEALTH CHECK — Verify saved flow before replay
# ═══════════════════════════════════════════════════════════════════

HEALTH_CHECK_JS = """
(selectorsJson) => {
    const selectors = JSON.parse(selectorsJson);
    const alive = [];
    const dead = [];
    
    for (const [fieldName, selector] of Object.entries(selectors)) {
        try {
            const el = document.querySelector(selector);
            if (el) {
                // Check if the element is visible (not hidden)
                const style = getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    alive.push(fieldName);
                } else {
                    dead.push(fieldName + ' (hidden)');
                }
            } else {
                dead.push(fieldName);
            }
        } catch(e) {
            dead.push(fieldName + ' (error)');
        }
    }
    
    return JSON.stringify({
        alive: alive.length,
        dead: dead.length,
        total: alive.length + dead.length,
        healthPct: alive.length / Math.max(alive.length + dead.length, 1) * 100,
        aliveFields: alive,
        deadFields: dead,
    });
}
"""


def check_flow_health(flow: dict) -> dict:
    """
    Returns a health summary for a saved flow WITHOUT needing a browser.
    
    Checks:
    - Has navigation steps
    - Has form selectors
    - Success rate (success_count vs failure_count)
    - Last success recency
    """
    nav_count = len(flow.get('navigation_steps', []))
    form_count = len(flow.get('form_selectors', {}))
    pay_count = len(flow.get('payment_selectors', {}))
    success_count = flow.get('success_count', 0)
    failure_count = flow.get('failure_count', 0)
    total_runs = success_count + failure_count
    
    success_rate = (success_count / total_runs * 100) if total_runs > 0 else 0
    
    # Determine status
    status = 'healthy'
    if total_runs >= 3 and success_rate < 50:
        status = 'degraded'
    if total_runs >= 3 and success_rate < 20:
        status = 'broken'
    if failure_count >= 3 and success_count == 0:
        status = 'broken'
    
    # Check recency
    last_success = flow.get('last_success')
    last_failure = flow.get('last_failure')
    needs_relearn = False
    
    if last_failure and last_success:
        # If last failure is more recent than last success, something changed
        if last_failure > last_success:
            needs_relearn = True
    
    # Consecutive failures trigger re-learn
    consecutive_failures = flow.get('consecutive_failures', 0)
    if consecutive_failures >= 2:
        needs_relearn = True
        status = 'needs_relearn'
    
    return {
        'status': status,
        'nav_steps': nav_count,
        'form_selectors': form_count,
        'payment_selectors': pay_count,
        'success_count': success_count,
        'failure_count': failure_count,
        'success_rate': round(success_rate, 1),
        'needs_relearn': needs_relearn,
        'consecutive_failures': consecutive_failures,
    }


def record_failure(domain_or_url: str, error: str = None):
    """Record a checkout failure for a domain."""
    domain = _domain_from_url(domain_or_url) if '/' in domain_or_url else domain_or_url
    path = _flow_path(domain)
    
    if not os.path.exists(path):
        return
    
    try:
        with open(path, 'r') as f:
            flow = json.load(f)
        
        flow['failure_count'] = flow.get('failure_count', 0) + 1
        flow['consecutive_failures'] = flow.get('consecutive_failures', 0) + 1
        flow['last_failure'] = datetime.now(timezone.utc).isoformat()
        if error:
            flow['last_error'] = error[:200]  # Truncate long errors
        
        with open(path, 'w') as f:
            json.dump(flow, f, indent=2)
        
        logger.info(f"📉 Recorded failure for '{domain}' (consecutive: {flow['consecutive_failures']})")
    except (json.JSONDecodeError, IOError) as e:
        logger.warning(f"⚠️ Could not record failure for '{domain}': {e}")


# ═══════════════════════════════════════════════════════════════════
# REPLAY ENGINE — Execute saved navigation steps with zero LLM
# ═══════════════════════════════════════════════════════════════════

REPLAY_CLICK_JS = """
(step) => {
    // Try multiple strategies to find the element
    
    // Strategy 1: CSS selector (most reliable if we have an ID)
    if (step.selector) {
        try {
            const el = document.querySelector(step.selector);
            if (el && (el.offsetParent !== null || el.offsetHeight > 0)) {
                el.click();
                return { found: true, method: 'selector', selector: step.selector };
            }
        } catch(e) {}
    }
    
    // Strategy 2: aria-label
    if (step.aria_label) {
        try {
            const el = document.querySelector(`[aria-label="${step.aria_label}"]`);
            if (el && (el.offsetParent !== null || el.offsetHeight > 0)) {
                el.click();
                return { found: true, method: 'aria_label', label: step.aria_label };
            }
        } catch(e) {}
    }
    
    // Strategy 3: Text content match (works for buttons, links)
    if (step.text) {
        const searchText = step.text.trim();
        // Search in buttons, links, and role=button elements
        const candidates = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"]')];
        
        // Try exact match first
        let match = candidates.find(el => {
            const elText = el.textContent?.trim() || el.value || '';
            return elText === searchText && (el.offsetParent !== null || el.offsetHeight > 0);
        });
        
        // Try contains match
        if (!match) {
            match = candidates.find(el => {
                const elText = el.textContent?.trim() || el.value || '';
                return elText.includes(searchText) && (el.offsetParent !== null || el.offsetHeight > 0);
            });
        }
        
        // Try partial match (first 20 chars)
        if (!match && searchText.length > 20) {
            const partial = searchText.substring(0, 20);
            match = candidates.find(el => {
                const elText = el.textContent?.trim() || el.value || '';
                return elText.includes(partial) && (el.offsetParent !== null || el.offsetHeight > 0);
            });
        }
        
        if (match) {
            match.click();
            return { found: true, method: 'text', text: searchText.substring(0, 30) };
        }
    }
    
    return { found: false, tried: [step.selector, step.aria_label, step.text].filter(Boolean) };
}
"""


# ═══════════════════════════════════════════════════════════════════
# SELECTOR DISCOVERY — Run after successful checkout
# ═══════════════════════════════════════════════════════════════════

DISCOVER_SELECTORS_JS = """
() => {
    const results = { form: {}, payment: {} };
    
    const FIELD_PATTERNS = {
        email:      { auto: ['email'], name: ['email'], type: ['email'] },
        first_name: { auto: ['given-name'], name: ['first', 'firstName', 'first_name'] },
        last_name:  { auto: ['family-name'], name: ['last', 'lastName', 'last_name'] },
        address:    { auto: ['address-line1', 'street-address'], name: ['address1', 'street', 'address'] },
        city:       { auto: ['address-level2'], name: ['city'] },
        state:      { auto: ['address-level1'], name: ['state', 'province', 'zone', 'region'] },
        zip_code:   { auto: ['postal-code'], name: ['zip', 'postal', 'postcode', 'postalCode'] },
        country:    { auto: ['country', 'country-name'], name: ['country', 'countryCode'] },
        phone:      { auto: ['tel', 'tel-national'], name: ['phone', 'telephone'], type: ['tel'] },
        card_number:  { auto: ['cc-number'], name: ['card_number', 'cardNumber', 'number'] },
        card_expiry:  { auto: ['cc-exp'], name: ['expiry', 'exp', 'expiration'] },
        card_cvv:     { auto: ['cc-csc'], name: ['cvv', 'cvc', 'verification', 'security'] },
        card_name:    { auto: ['cc-name'], name: ['cardholder', 'card_name', 'nameOnCard'] },
    };
    
    const PAYMENT_FIELDS = new Set(['card_number', 'card_expiry', 'card_cvv', 'card_name']);
    
    function detectFieldType(el) {
        const auto = (el.getAttribute('autocomplete') || '').toLowerCase();
        const name = (el.getAttribute('name') || '').toLowerCase();
        const id = (el.getAttribute('id') || '').toLowerCase();
        const type = (el.getAttribute('type') || '').toLowerCase();
        
        for (const [fieldType, patterns] of Object.entries(FIELD_PATTERNS)) {
            if (patterns.auto && patterns.auto.some(p => auto === p)) return fieldType;
            if (patterns.name && patterns.name.some(p => 
                name.includes(p.toLowerCase()) || id.includes(p.toLowerCase())
            )) return fieldType;
            if (patterns.type && patterns.type.some(p => type === p)) return fieldType;
        }
        return null;
    }
    
    function buildSelector(el) {
        const auto = el.getAttribute('autocomplete');
        if (auto) return `[autocomplete="${auto}"]`;
        const id = el.getAttribute('id');
        if (id) return `#${CSS.escape(id)}`;
        const name = el.getAttribute('name');
        const tag = el.tagName.toLowerCase();
        if (name) return `${tag}[name="${name}"]`;
        const type = el.getAttribute('type');
        const placeholder = el.getAttribute('placeholder');
        if (type && placeholder) return `${tag}[type="${type}"][placeholder="${placeholder}"]`;
        return null;
    }
    
    const elements = document.querySelectorAll('input, select, textarea');
    for (const el of elements) {
        if (el.type === 'hidden' || el.disabled) continue;
        if (!el.value && el.tagName !== 'SELECT') continue;
        const fieldType = detectFieldType(el);
        if (!fieldType) continue;
        const selector = buildSelector(el);
        if (!selector) continue;
        try {
            const found = document.querySelector(selector);
            if (found !== el) continue;
        } catch(e) { continue; }
        const bucket = PAYMENT_FIELDS.has(fieldType) ? 'payment' : 'form';
        results[bucket][fieldType] = selector;
    }
    
    const selects = document.querySelectorAll('select');
    for (const sel of selects) {
        if (sel.selectedIndex <= 0) continue;
        const fieldType = detectFieldType(sel);
        if (!fieldType) continue;
        const selector = buildSelector(sel);
        if (!selector) continue;
        const bucket = PAYMENT_FIELDS.has(fieldType) ? 'payment' : 'form';
        if (!results[bucket][fieldType]) results[bucket][fieldType] = selector;
    }
    
    return JSON.stringify(results);
}
"""

DETECT_PLATFORM_JS = """
() => {
    const url = window.location.href;
    const html = document.documentElement.innerHTML.substring(0, 5000);
    if (url.includes('/checkouts/') || url.includes('checkout.shopify.com') ||
        html.includes('Shopify.Checkout') || html.includes('shopify-payment')) return 'shopify';
    if (html.includes('woocommerce') || html.includes('wc-checkout') ||
        document.querySelector('.woocommerce-checkout')) return 'woocommerce';
    if (html.includes('Magento') || html.includes('magento')) return 'magento';
    if (html.includes('BigCommerce') || html.includes('bigcommerce')) return 'bigcommerce';
    return 'unknown';
}
"""
