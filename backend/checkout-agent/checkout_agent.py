"""
ClawCart Checkout Agent — powered by browser-use

LEARNING LOOP (learn once, replay forever):
  Visit 1: LLM navigates everything → record all clicks + selectors → save
  Visit 2: Replay navigation (0 LLM) → saved selectors (0 LLM) → LLM reviews only
  Visit N: Entire checkout ~30s with near-zero LLM cost

Architecture:
  1. Load saved flow for this domain
  2. IF saved flow exists:
     a. Replay navigation steps (click cookie, add-to-cart, checkout, guest) — 0 LLM
     b. Fill forms with saved selectors — 0 LLM
     c. LLM only handles what replay missed
  3. IF no saved flow:
     a. LLM navigates from scratch
     b. Custom tools fill forms
     c. Record everything for next time
  4. After success → extract & save navigation steps + selectors
"""

import asyncio
import json
import logging
import os
import time
from typing import Optional

from browser_use import Agent, Browser, ActionResult, Tools
from dotenv import load_dotenv
from pydantic import BaseModel

import flow_store

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logger = logging.getLogger('checkout_agent')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(name)s] %(levelname)s: %(message)s')


# ═══════════════════════════════════════════════════════════════════
# DATA MODELS
# ═══════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════
# DECISION POINTS — Structured issue reporting
# ═══════════════════════════════════════════════════════════════════

class DecisionPoint(BaseModel):
    """A problem the agent detected that needs user input."""
    type: str  # 'variant_unavailable', 'price_mismatch', 'shipping_options', 'payment_declined', 'captcha', 'other'
    message: str  # Human-readable description
    options: list = []  # Available alternatives (e.g., ["L", "2XL"] when XL is sold out)
    expected_value: Optional[str] = None  # What the user originally wanted
    actual_value: Optional[str] = None  # What the site shows


class ShippingAddress(BaseModel):
    full_name: str = ""
    street: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    country: str = "US"
    phone: str = ""

class CardDetails(BaseModel):
    number: str = ""
    cvv: str = ""
    expiry_month: str = ""
    expiry_year: str = ""
    cardholder_name: str = ""

class CheckoutRequest(BaseModel):
    product_url: str
    product_title: str = "Product"
    email: str = ""
    shipping: ShippingAddress = ShippingAddress()
    card: CardDetails = CardDetails()
    dry_run: bool = True
    headless: bool = False
    max_steps: int = 50
    saved_form_selectors: Optional[dict] = None
    saved_payment_selectors: Optional[dict] = None

class CheckoutResult(BaseModel):
    success: bool = False
    error: Optional[str] = None
    order_id: Optional[str] = None
    final_url: Optional[str] = None
    execution_ms: int = 0
    llm_steps: int = 0
    dry_run: bool = True
    learned_selectors: Optional[dict] = None
    replay_steps_used: int = 0  # How many nav steps were replayed (0 = all LLM)
    decision_needed: bool = False  # True if the agent hit a problem requiring user input
    decision_points: list = []  # List of DecisionPoint dicts describing what needs user input


# ═══════════════════════════════════════════════════════════════════
# COUNTRY MAPPING
# ═══════════════════════════════════════════════════════════════════

COUNTRY_MAP = {
    'AF': 'Afghanistan', 'AL': 'Albania', 'DZ': 'Algeria', 'AR': 'Argentina',
    'AU': 'Australia', 'AT': 'Austria', 'BE': 'Belgium', 'BR': 'Brazil',
    'CA': 'Canada', 'CL': 'Chile', 'CN': 'China', 'CO': 'Colombia',
    'CZ': 'Czech Republic', 'DK': 'Denmark', 'EG': 'Egypt', 'FI': 'Finland',
    'FR': 'France', 'DE': 'Germany', 'GR': 'Greece', 'HK': 'Hong Kong',
    'HU': 'Hungary', 'IN': 'India', 'ID': 'Indonesia', 'IE': 'Ireland',
    'IL': 'Israel', 'IT': 'Italy', 'JP': 'Japan', 'MY': 'Malaysia',
    'MX': 'Mexico', 'NL': 'Netherlands', 'NZ': 'New Zealand', 'NO': 'Norway',
    'PK': 'Pakistan', 'PE': 'Peru', 'PH': 'Philippines', 'PL': 'Poland',
    'PT': 'Portugal', 'RO': 'Romania', 'RU': 'Russia', 'SA': 'Saudi Arabia',
    'SG': 'Singapore', 'ZA': 'South Africa', 'KR': 'South Korea',
    'ES': 'Spain', 'SE': 'Sweden', 'CH': 'Switzerland', 'TW': 'Taiwan',
    'TH': 'Thailand', 'TR': 'Turkey', 'UA': 'Ukraine', 'AE': 'United Arab Emirates',
    'GB': 'United Kingdom', 'US': 'United States', 'VN': 'Vietnam',
}

def country_name(code: str) -> str:
    return COUNTRY_MAP.get(code.upper(), code)


# ═══════════════════════════════════════════════════════════════════
# FORM FILL JS
# ═══════════════════════════════════════════════════════════════════

FORM_FILL_JS = """
async (fieldsJson) => {
    const fields = JSON.parse(fieldsJson);
    const filled = [];
    const missed = [];
    const verified = [];
    const retried = [];
    const usedSelectors = {};
    
    function clearField(el) {
        // Always clear before filling to prevent "John DoeJohn Doe" double-fill
        el.focus();
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        // Also try select-all + delete for React controlled inputs
        try {
            el.setSelectionRange(0, el.value.length || 9999);
            document.execCommand('selectAll');
            document.execCommand('delete');
        } catch(e) {}
    }
    
    function setNativeValue(el, value) {
        // Clear first
        clearField(el);
        
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, value);
        } else {
            el.value = value;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }
    
    function verifyField(el, expectedValue) {
        // Read back the value and check it matches what we typed
        const actual = (el.value || '').trim();
        const expected = (expectedValue || '').trim();
        if (!expected) return true;  // Nothing to verify
        // Allow partial match for phone numbers (formatting may differ)
        if (actual === expected) return true;
        if (actual.replace(/[\\s\\-\\(\\)]/g, '') === expected.replace(/[\\s\\-\\(\\)]/g, '')) return true;
        return false;
    }
    
    const MAX_RETRIES = 2;
    
    // Small delay between fields to appear human-like and let React re-render
    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    
    for (const field of fields) {
        const { name, value, selectors, isSelect, selectCode } = field;
        if (!value && !selectCode) { missed.push(name + ' (no value)'); continue; }
        
        let found = false;
        for (const sel of selectors) {
            try {
                const el = document.querySelector(sel);
                if (!el) continue;
                // Skip hidden/disabled elements
                if (el.disabled || el.type === 'hidden') continue;
                try {
                    const style = getComputedStyle(el);
                    if (style.display === 'none' || style.visibility === 'hidden') continue;
                } catch(e) {}
                
                if (isSelect || el.tagName === 'SELECT') {
                    const tryValues = selectCode ? [selectCode, value] : [value];
                    for (const v of tryValues) {
                        for (const opt of el.options) {
                            if (opt.value === v || opt.textContent.trim() === v ||
                                opt.value.toLowerCase() === v.toLowerCase() ||
                                opt.textContent.trim().toLowerCase() === v.toLowerCase()) {
                                el.value = opt.value;
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                found = true;
                                break;
                            }
                        }
                        if (found) break;
                    }
                } else {
                    // Fill → Verify → Retry loop
                    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                        el.focus();
                        setNativeValue(el, value);
                        
                        // Verify the value was actually set
                        if (verifyField(el, value)) {
                            found = true;
                            if (attempt > 0) retried.push(name);
                            verified.push(name);
                            break;
                        }
                        // Retry: try alternative methods
                        if (attempt < MAX_RETRIES) {
                            // Method 2: Direct property set + manual events
                            el.value = '';
                            el.value = value;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            if (verifyField(el, value)) {
                                found = true;
                                retried.push(name);
                                verified.push(name);
                                break;
                            }
                        }
                    }
                    if (!found) {
                        // Last resort: execCommand insertText (works on some React inputs)
                        try {
                            el.focus();
                            clearField(el);
                            document.execCommand('insertText', false, value);
                            if (verifyField(el, value)) {
                                found = true;
                                retried.push(name);
                                verified.push(name);
                            }
                        } catch(e) {}
                    }
                }
                
                if (found) {
                    filled.push(name);
                    usedSelectors[name] = sel;
                    break;
                }
            } catch(e) { continue; }
        }
        if (!found) missed.push(name);
        
        // Human-like delay between fields (100-300ms)
        await sleep(100 + Math.random() * 200);
    }
    
    return JSON.stringify({ filled, missed, verified, retried, total: fields.length, usedSelectors });
}
"""


def build_field_list(email, first_name, last_name, street, city, state, zip_code,
                     country_code, c_name, phone, saved_selectors=None):
    """Build field list with saved selectors tried FIRST."""
    saved = saved_selectors or {}
    
    def sels(field_name, universal):
        result = []
        if field_name in saved:
            result.append(saved[field_name])
        result.extend(universal)
        return result
    
    return [
        {"name": "email", "value": email, "selectors": sels("email", [
            '[autocomplete="email"]', 'input[name="email"]', 'input[type="email"]',
            '#email', '#checkout_email', 'input[id*="email"]',
        ]), "isSelect": False, "selectCode": None},
        {"name": "country", "value": c_name, "selectors": sels("country", [
            'select[autocomplete="country"]', 'select[name*="country"]',
            'select[autocomplete="country-name"]', '#country', 'select[id*="country"]',
        ]), "isSelect": True, "selectCode": country_code},
        {"name": "first_name", "value": first_name, "selectors": sels("first_name", [
            '[autocomplete="given-name"]', 'input[name*="first"]', 'input[name*="First"]',
            '#firstName', 'input[id*="firstName"]',
        ]), "isSelect": False, "selectCode": None},
        {"name": "last_name", "value": last_name, "selectors": sels("last_name", [
            '[autocomplete="family-name"]', 'input[name*="last"]', 'input[name*="Last"]',
            '#lastName', 'input[id*="lastName"]',
        ]), "isSelect": False, "selectCode": None},
        {"name": "address", "value": street, "selectors": sels("address", [
            '[autocomplete="address-line1"]', 'input[name*="address1"]',
            'input[name*="street"]', '#address1',
        ]), "isSelect": False, "selectCode": None},
        {"name": "city", "value": city, "selectors": sels("city", [
            '[autocomplete="address-level2"]', 'input[name*="city"]', '#city',
        ]), "isSelect": False, "selectCode": None},
        {"name": "state", "value": state, "selectors": sels("state", [
            '[autocomplete="address-level1"]', 'select[name*="state"]', 'select[name*="zone"]',
            'input[name*="state"]', '#province',
        ]), "isSelect": False, "selectCode": None},
        {"name": "zip_code", "value": zip_code, "selectors": sels("zip_code", [
            '[autocomplete="postal-code"]', 'input[name*="zip"]', 'input[name*="postal"]',
            '#postalCode',
        ]), "isSelect": False, "selectCode": None},
        {"name": "phone", "value": phone, "selectors": sels("phone", [
            '[autocomplete="tel"]', 'input[name*="phone"]', 'input[type="tel"]', '#phone',
        ]), "isSelect": False, "selectCode": None},
    ]


def build_payment_field_list(card_number, card_exp, card_cvv, card_name, saved_selectors=None):
    saved = saved_selectors or {}
    def sels(field_name, universal):
        result = []
        if field_name in saved:
            result.append(saved[field_name])
        result.extend(universal)
        return result
    
    return [
        {"name": "card_number", "value": card_number, "selectors": sels("card_number", [
            '[autocomplete="cc-number"]', 'input[name*="card_number"]',
            'input[name*="cardNumber"]', 'input[name*="number"]',
        ])},
        {"name": "expiry", "value": card_exp, "selectors": sels("card_expiry", [
            '[autocomplete="cc-exp"]', 'input[name*="expiry"]',
            'input[name*="exp"]', 'input[placeholder*="MM"]',
        ])},
        {"name": "cvv", "value": card_cvv, "selectors": sels("card_cvv", [
            '[autocomplete="cc-csc"]', 'input[name*="cvv"]',
            'input[name*="cvc"]', 'input[name*="verification"]',
        ])},
        {"name": "cardholder", "value": card_name, "selectors": sels("card_name", [
            '[autocomplete="cc-name"]', 'input[name*="cardholder"]',
            'input[name*="card_name"]', 'input[name*="nameOnCard"]',
        ])},
    ]


# ═══════════════════════════════════════════════════════════════════
# CHECKOUT AGENT
# ═══════════════════════════════════════════════════════════════════

async def run_checkout(request: CheckoutRequest) -> CheckoutResult:
    """Main entry point."""
    start_time = time.time()
    
    logger.info(f"🛒 Starting checkout: {request.product_url}")
    logger.info(f"   Dry-run: {request.dry_run} | Headless: {request.headless}")
    
    # ── Load saved flow ───────────────────────────────────────────
    saved_flow = flow_store.load_flow(request.product_url)
    saved_form_sels = request.saved_form_selectors or {}
    saved_payment_sels = request.saved_payment_selectors or {}
    saved_nav_steps = []
    
    if saved_flow:
        # Health check — skip replay if flow is broken
        health = flow_store.check_flow_health(saved_flow)
        logger.info(f"   🏥 Flow health: {health['status']} (success rate: {health['success_rate']}%, consecutive failures: {health['consecutive_failures']})")
        
        if health['needs_relearn']:
            logger.info(f"   🔄 Flow needs re-learning — ignoring saved nav steps, starting fresh with LLM")
            # Keep selectors (they might still work) but drop nav steps
            saved_form_sels = {**saved_flow.get('form_selectors', {}), **saved_form_sels}
            saved_payment_sels = {**saved_flow.get('payment_selectors', {}), **saved_payment_sels}
            saved_nav_steps = []  # Force re-learn navigation
        else:
            saved_form_sels = {**saved_flow.get('form_selectors', {}), **saved_form_sels}
            saved_payment_sels = {**saved_flow.get('payment_selectors', {}), **saved_payment_sels}
            saved_nav_steps = saved_flow.get('navigation_steps', [])
    
    has_saved_sels = bool(saved_form_sels)
    has_saved_nav = bool(saved_nav_steps)
    
    if has_saved_nav:
        logger.info(f"   ⏩ {len(saved_nav_steps)} saved nav steps + {len(saved_form_sels)} form selectors + {len(saved_payment_sels)} payment selectors")
    elif has_saved_sels:
        logger.info(f"   📬 {len(saved_form_sels)} saved form selectors (no nav steps yet)")
    else:
        logger.info(f"   📭 No saved data — will learn on this visit")
    
    # ── Resolve LLM ──────────────────────────────────────────────
    anthropic_key = os.getenv('ANTHROPIC_API_KEY', '')
    openai_key = os.getenv('OPENAI_API_KEY', '')
    browser_use_key = os.getenv('BROWSER_USE_API_KEY', '')
    
    llm = None
    llm_name = "unknown"
    
    if browser_use_key:
        from browser_use import ChatBrowserUse
        llm = ChatBrowserUse(api_key=browser_use_key)
        llm_name = "ChatBrowserUse (cloud)"
    elif anthropic_key:
        from browser_use import ChatAnthropic
        llm = ChatAnthropic(model="claude-sonnet-4-20250514", api_key=anthropic_key, max_tokens=4096)
        llm_name = "claude-sonnet-4-20250514"
    elif openai_key:
        from browser_use import ChatOpenAI
        llm = ChatOpenAI(model="gpt-4o", api_key=openai_key)
        llm_name = "gpt-4o"
    else:
        return CheckoutResult(
            success=False,
            error="No LLM API key found.",
            execution_ms=int((time.time() - start_time) * 1000),
            dry_run=request.dry_run,
        )
    
    logger.info(f"   LLM: {llm_name}")
    
    # ── Build custom tools ───────────────────────────────────────
    tools = Tools()
    shipping = request.shipping
    card = request.card
    email = request.email
    c_name = country_name(shipping.country)
    fill_results = {"form": {}, "payment": {}}
    
    first_name = shipping.full_name.split()[0] if shipping.full_name else ""
    last_name = " ".join(shipping.full_name.split()[1:]) if shipping.full_name and len(shipping.full_name.split()) > 1 else first_name
    
    @tools.action(
        'Fill shipping/contact form fields on the checkout page. '
        'Call this ONCE when you reach the checkout page with shipping form fields visible. '
        'After calling this, take a screenshot to verify which fields were filled.'
    )
    async def fill_shipping_form(browser_session: Browser):
        page = await browser_session.get_current_page()
        fields_data = json.dumps(build_field_list(
            email=email, first_name=first_name, last_name=last_name,
            street=shipping.street, city=shipping.city, state=shipping.state,
            zip_code=shipping.zip_code, country_code=shipping.country,
            c_name=c_name, phone=shipping.phone, saved_selectors=saved_form_sels,
        ))
        
        try:
            result_str = await page.evaluate(FORM_FILL_JS, fields_data)
            result = json.loads(result_str)
            filled = result.get("filled", [])
            missed = result.get("missed", [])
            verified = result.get("verified", [])
            retried = result.get("retried", [])
            total = result.get("total", 0)
            used_selectors = result.get("usedSelectors", {})
            fill_results["form"] = used_selectors
        except Exception as e:
            logger.warning(f"JS form fill error: {e}")
            filled, missed, verified, retried, total = [], ["all (JS error)"], [], [], 9
        
        used_saved = sum(1 for k, v in fill_results["form"].items()
                        if k in saved_form_sels and saved_form_sels.get(k) == v)
        
        summary = f"Filled {len(filled)}/{total} fields. Verified: {len(verified)}/{len(filled)}.\n"
        if has_saved_sels:
            summary += f"📬 {used_saved} fields used SAVED selectors (instant)\n"
        if filled:
            summary += f"✅ Filled: {', '.join(filled)}\n"
        if retried:
            summary += f"🔄 Required retry: {', '.join(retried)}\n"
        if missed:
            summary += f"⚠️ Missed (fill manually): {', '.join(missed)}"
        
        logger.info(f"📝 Form fill: {len(filled)}/{total} ({len(verified)} verified, {len(retried)} retried, {used_saved} from saved)")
        return ActionResult(extracted_content=summary)
    
    decision_points_collected = []
    
    @tools.action(
        'Report a problem that needs user input. Call this when you encounter: '
        '(1) Variant/size unavailable — list available alternatives, '
        '(2) Price mismatch — expected vs actual price, '
        '(3) Multiple shipping options — list them with prices, '
        '(4) Payment declined or method unavailable, '
        '(5) CAPTCHA or bot detection blocking progress. '
        'After reporting, output DECISION_NEEDED as your final message.'
    )
    async def report_decision_needed(
        browser_session: Browser,
        decision_type: str,
        message: str,
        options: str = "",  # Comma-separated alternatives
        expected_value: str = "",
        actual_value: str = "",
    ):
        dp = DecisionPoint(
            type=decision_type,
            message=message,
            options=[o.strip() for o in options.split(',') if o.strip()] if options else [],
            expected_value=expected_value or None,
            actual_value=actual_value or None,
        )
        decision_points_collected.append(dp.model_dump())
        logger.info(f"🛑 Decision needed: {decision_type} — {message}")
        return ActionResult(
            extracted_content=f"Decision point recorded: {decision_type} — {message}. "
            f"Output DECISION_NEEDED as your final message to pause checkout and ask the user."
        )
    
    @tools.action(
        'Detect if the current page is a Shopify store and instantly add the product to cart '
        'via API (no clicking needed). Call this FIRST when you land on a product page. '
        'If successful, navigate to /checkout to skip the cart page entirely.'
    )
    async def shopify_instant_cart(browser_session: Browser):
        page = await browser_session.get_current_page()
        try:
            detect_str = await page.evaluate(SHOPIFY_DETECT_AND_CART_JS)
            detect = json.loads(detect_str)
            
            if not detect.get('isShopify'):
                return ActionResult(extracted_content="Not a Shopify store. Use normal add-to-cart flow.")
            
            variant_id = detect.get('variantId')
            if not variant_id:
                return ActionResult(extracted_content="Shopify store detected but couldn't find variant ID. Select the variant manually and try again, or use normal add-to-cart.")
            
            # Add to cart via API — instant!
            cart_str = await page.evaluate(SHOPIFY_ADD_TO_CART_JS, variant_id)
            cart_result = json.loads(cart_str)
            
            if cart_result.get('success'):
                item_name = cart_result.get('item', 'product')
                variant_name = cart_result.get('variant', '')
                logger.info(f"⚡ Shopify instant cart: {item_name} ({variant_name})")
                return ActionResult(
                    extracted_content=f"⚡ Shopify instant add-to-cart SUCCESS!\n"
                    f"Added: {item_name} ({variant_name})\n"
                    f"Now navigate to /checkout to skip the cart page."
                )
            else:
                error = cart_result.get('error', 'Unknown error')
                logger.warning(f"⚠️ Shopify cart API failed: {error}")
                return ActionResult(extracted_content=f"Shopify cart API failed: {error}. Use normal add-to-cart button instead.")
        except Exception as e:
            logger.warning(f"⚠️ Shopify detection error: {e}")
            return ActionResult(extracted_content=f"Shopify detection failed: {e}. Use normal add-to-cart flow.")
    
    @tools.action(
        'Fill payment/credit card form fields. '
        'Call this when you see credit card input fields on the checkout page.'
    )
    async def fill_payment_form(browser_session: Browser):
        page = await browser_session.get_current_page()
        card_exp = f"{card.expiry_month}/{card.expiry_year}"
        card_name_val = card.cardholder_name or shipping.full_name
        
        fields_data = json.dumps(build_payment_field_list(
            card_number=card.number, card_exp=card_exp,
            card_cvv=card.cvv, card_name=card_name_val,
            saved_selectors=saved_payment_sels,
        ))
        
        try:
            result_str = await page.evaluate(FORM_FILL_JS, fields_data)
            result = json.loads(result_str)
            filled = result.get("filled", [])
            missed = result.get("missed", [])
            fill_results["payment"] = result.get("usedSelectors", {})
        except Exception as e:
            logger.warning(f"JS payment fill error: {e}")
            filled, missed = [], ["all (JS error - may be in iframes)"]
        
        summary = f"Payment: filled {len(filled)} fields.\n"
        if filled: summary += f"✅ Filled: {', '.join(filled)}\n"
        if missed: summary += f"⚠️ Missed (fill manually): {', '.join(missed)}"
        
        logger.info(f"💳 Payment fill: {len(filled)} fields")
        return ActionResult(extracted_content=summary)
    
    # ── Configure browser ────────────────────────────────────────
    if browser_use_key:
        browser = Browser(headless=request.headless, viewport={'width': 1366, 'height': 768}, use_cloud=True)
        logger.info("   Browser: Browser Use Cloud ☁️")
    else:
        browser = Browser(headless=request.headless, viewport={'width': 1366, 'height': 768})
        logger.info("   Browser: Local Chromium")
    
    # ── BUILD TASK PROMPT ────────────────────────────────────────
    dry_run_instruction = ""
    if request.dry_run:
        dry_run_instruction = """
CRITICAL DRY-RUN MODE:
- DO NOT click "Place Order", "Complete Purchase", "Pay Now", or any final submit button.
- Navigate the ENTIRE checkout flow and fill ALL forms.
- STOP right before the final purchase button.
- When you have reached the final review/payment page with all fields filled,
  output "DRY_RUN_COMPLETE" as your final message.
"""
    
    decision_instruction = """
DECISION POINTS — Report problems instead of guessing:
- If the requested SIZE/COLOR/VARIANT is sold out or unavailable, call `report_decision_needed` with
  type="variant_unavailable", list the available alternatives in options, and set expected_value to what the user wanted.
- If the PRICE is significantly different (>10%) from what was expected, call `report_decision_needed` with
  type="price_mismatch" and set expected_value/actual_value.
- If there are MULTIPLE SHIPPING OPTIONS with different prices/speeds, call `report_decision_needed` with
  type="shipping_options" and list them in options.
- If PAYMENT is declined or the payment method isn't available, call `report_decision_needed` with
  type="payment_declined".
- If you're blocked by CAPTCHA or bot detection, call `report_decision_needed` with type="captcha".
- After calling report_decision_needed, output "DECISION_NEEDED" as your final message.
- Do NOT guess or pick alternatives yourself — always ask the user.
"""
    
    replay_count = 0
    
    # ── Start browser early so we can inject CDP scripts ─────────
    browser_started = False
    try:
        await browser.start()
        browser_started = True
    except Exception as e:
        logger.warning(f"⚠️ Could not pre-start browser: {e}")
    
    # ── Inject persistent popup auto-dismiss script ───────────────
    if browser_started:
        popup_dismiss_script = _build_popup_dismiss_script()
        try:
            await browser._cdp_add_init_script(popup_dismiss_script)
            logger.info("🛡️ Injected popup auto-dismiss script")
        except Exception as e:
            logger.warning(f"⚠️ Could not inject popup dismiss script: {e}")
    
    # ── Inject auto-click replay script via CDP ───────────────────
    if has_saved_nav:
        pre_form_steps = _filter_pre_form_steps(saved_nav_steps)
        replay_count = len([s for s in pre_form_steps if s.get('action') == 'click'])
        
        if replay_count > 0 and browser_started:
            try:
                replay_script = _build_page_replay_script(pre_form_steps, request.product_url)
                await browser._cdp_add_init_script(replay_script)
                logger.info(f"⏩ Injected auto-click script for {replay_count} navigation clicks (0 LLM calls)")
            except Exception as e:
                logger.warning(f"⚠️ Could not inject replay script: {e}")
                replay_count = 0
    
    # ── Build task based on saved knowledge ────
    if has_saved_nav and replay_count > 0:
        # VISIT 2+: Auto-clicks handle navigation.
        # LLM starts after page auto-navigates to checkout form.
        task = f"""You are a checkout automation agent. An auto-click script is navigating through
cookies, add-to-cart, and checkout buttons. You may land on the checkout/address form
shortly — or you may need to handle remaining steps.

IMPORTANT: Take a screenshot and assess where you are. Possible states:
- Product page (auto-click in progress) → wait 5-10 seconds, then reassess
- Cart/checkout page → click Continue/Verder to proceed
- Address form → call `fill_shipping_form`
- Payment page → call `fill_payment_form`

CUSTOMER DETAILS:
- Email: {email}  |  Name: {first_name} {last_name}
- Address: {shipping.street}, {shipping.city}, {shipping.state} {shipping.zip_code}
- Country: {c_name} ({shipping.country})  |  Phone: {shipping.phone}

PAYMENT: Card {card.number}, Exp {card.expiry_month}/{card.expiry_year}, CVV {card.cvv}
{dry_run_instruction}
{decision_instruction}
RULES:
- Use fill_shipping_form and fill_payment_form (faster than typing)
- If address fields need manual entry (postcode, house number, street, city), type them
- Dismiss popups, use guest checkout if asked
- If on the product page, WAIT — auto-clicks will navigate for you
- Batch actions when possible (up to 5 per step)
"""
        max_steps = min(request.max_steps, 30)
    else:
        # VISIT 1: No saved data — explore from scratch
        saved_hint = ""
        if has_saved_sels:
            saved_hint = f"\nNOTE: Form fill tools have {len(saved_form_sels)} saved selectors — most fields fill instantly.\n"
        
        task = f"""You are a checkout automation agent. Complete the purchase of a product.

PRODUCT URL: {request.product_url}
PRODUCT: {request.product_title}

CUSTOMER DETAILS:
- Email: {email}  |  Name: {first_name} {last_name}
- Address: {shipping.street}, {shipping.city}, {shipping.state} {shipping.zip_code}
- Country: {c_name} ({shipping.country})  |  Phone: {shipping.phone}

PAYMENT: Card {card.number}, Exp {card.expiry_month}/{card.expiry_year}, CVV {card.cvv}

STEPS:
1. Navigate to product URL → Call `shopify_instant_cart` FIRST (works on Shopify stores — instant add to cart)
2. If Shopify shortcut worked → navigate to /checkout. Otherwise → click Add to Cart button manually
3. Call `fill_shipping_form` to auto-fill form fields
4. Manually fix any missed fields
5. Call `fill_payment_form` when credit card fields appear
6. Fix missed payment fields → Review order
{dry_run_instruction}
{saved_hint}
{decision_instruction}
RULES:
- ALWAYS try `shopify_instant_cart` first on product pages — it's instant and skips clicking
- Dismiss cookie banners ("Accept" / "Alles accepteren")
- Use "Guest checkout" / "Doorgaan zonder registratie" if asked
- Country: {c_name}
- Use fill_shipping_form and fill_payment_form — faster than typing
"""
        max_steps = request.max_steps
    
    # ── Create and run agent ─────────────────────────────────────
    # Always navigate to the product URL as the first action
    initial_actions = [{'navigate': {'url': request.product_url, 'new_tab': False}}]
    
    agent = Agent(
        task=task,
        llm=llm,
        browser=browser,
        tools=tools,
        max_steps=max_steps,
        max_actions_per_step=5,
        initial_actions=initial_actions,
    )
    
    try:
        logger.info(f"🚀 Running LLM agent (max {max_steps} steps)...")
        history = await agent.run()
        
        elapsed_ms = int((time.time() - start_time) * 1000)
        
        final_result = history.final_result() if history else None
        is_success = history.is_done() if history else False
        n_steps = len(history.action_results()) if history else 0
        
        final_url = None
        try:
            page = await browser.get_current_page()
            final_url = page.url if page else None
        except Exception:
            pass
        
        dry_run_complete = False
        if request.dry_run and final_result and 'DRY_RUN_COMPLETE' in str(final_result):
            dry_run_complete = True
        
        decision_needed = bool(final_result and 'DECISION_NEEDED' in str(final_result))
        
        success = is_success or dry_run_complete
        
        logger.info(f"{'✅' if success else '⚠️'} Agent finished in {elapsed_ms}ms — {replay_count} replayed + {n_steps} LLM steps")
        
        # ── Record failure if not successful ──────────────────────
        if not success:
            error_msg = final_result or "Agent did not complete checkout"
            flow_store.record_failure(request.product_url, str(error_msg)[:200])
        
        # ── POST-CHECKOUT: Learn & save ──────────────────────────
        learned_selectors = None
        if success:
            try:
                # Extract navigation steps from agent history
                nav_steps = flow_store.extract_navigation_steps(history)
                
                # If we replayed some steps, prepend them to the new ones
                if replay_count > 0 and saved_nav_steps:
                    # Keep the replayed steps + add any new ones from the LLM
                    all_nav_steps = saved_nav_steps[:replay_count] + nav_steps
                else:
                    all_nav_steps = nav_steps
                
                learned_selectors = await _discover_and_save(
                    browser, request, final_url, fill_results, all_nav_steps
                )
            except Exception as e:
                logger.warning(f"⚠️ Post-checkout learning failed: {e}")
        
        return CheckoutResult(
            success=success,
            order_id=None,
            final_url=final_url,
            execution_ms=elapsed_ms,
            llm_steps=n_steps,
            dry_run=request.dry_run,
            error=None if success else (final_result or "Agent did not complete checkout"),
            learned_selectors=learned_selectors,
            replay_steps_used=replay_count,
            decision_needed=decision_needed,
            decision_points=decision_points_collected,
        )
        
    except Exception as e:
        elapsed_ms = int((time.time() - start_time) * 1000)
        logger.error(f"❌ Checkout failed: {e}")
        # Record failure for health tracking
        flow_store.record_failure(request.product_url, str(e))
        return CheckoutResult(
            success=False,
            error=str(e),
            execution_ms=elapsed_ms,
            dry_run=request.dry_run,
        )
    finally:
        try:
            await browser.close()
        except Exception:
            pass


SHOPIFY_DETECT_AND_CART_JS = """
() => {
    // Detect if this is a Shopify store
    const isShopify = !!(
        window.Shopify || 
        document.querySelector('meta[name="shopify-checkout-api-token"]') ||
        document.querySelector('link[href*="cdn.shopify"]') ||
        document.querySelector('script[src*="cdn.shopify"]')
    );
    
    if (!isShopify) return JSON.stringify({ isShopify: false });
    
    // Try to get the current variant ID from the page
    let variantId = null;
    
    // Method 1: From Shopify's global product data
    try {
        if (window.ShopifyAnalytics && window.ShopifyAnalytics.meta && window.ShopifyAnalytics.meta.product) {
            const variants = window.ShopifyAnalytics.meta.product.variants;
            if (variants && variants.length > 0) {
                // Get selected variant or first available
                const selected = variants.find(v => v.available) || variants[0];
                variantId = selected.id;
            }
        }
    } catch(e) {}
    
    // Method 2: From the select element on the product page
    if (!variantId) {
        const variantSelect = document.querySelector('select[name="id"], select.product-single__variants');
        if (variantSelect) variantId = variantSelect.value;
    }
    
    // Method 3: From hidden input
    if (!variantId) {
        const hiddenInput = document.querySelector('input[name="id"][type="hidden"]');
        if (hiddenInput) variantId = hiddenInput.value;
    }
    
    // Method 4: From URL parameter
    if (!variantId) {
        const urlParams = new URLSearchParams(window.location.search);
        variantId = urlParams.get('variant');
    }
    
    // Method 5: From product JSON
    if (!variantId) {
        try {
            const productJson = document.querySelector('[data-product-json], script[type="application/json"][data-product-json]');
            if (productJson) {
                const product = JSON.parse(productJson.textContent);
                const available = product.variants?.find(v => v.available);
                if (available) variantId = available.id;
            }
        } catch(e) {}
    }
    
    return JSON.stringify({
        isShopify: true,
        variantId: variantId ? String(variantId) : null,
        shopDomain: window.Shopify?.shop || window.location.hostname,
    });
}
"""

SHOPIFY_ADD_TO_CART_JS = """
(variantId) => {
    return fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ id: parseInt(variantId), quantity: 1 }] }),
    })
    .then(r => r.json())
    .then(data => {
        if (data.items && data.items.length > 0) {
            return JSON.stringify({ success: true, item: data.items[0].title, variant: data.items[0].variant_title });
        }
        return JSON.stringify({ success: false, error: JSON.stringify(data) });
    })
    .catch(e => JSON.stringify({ success: false, error: e.message }));
}
"""


def _build_popup_dismiss_script() -> str:
    """
    Build a JS script that auto-dismisses cookie banners, popups, and overlays
    on every page load. Uses MutationObserver to catch popups that appear after
    page load (e.g., exit-intent popups, delayed cookie banners).
    """
    return """(function() {
  if (window.__cc_popup_dismiss) return;
  window.__cc_popup_dismiss = true;
  
  // Common cookie/popup button texts (multi-language)
  var DISMISS_TEXTS = [
    'accept all', 'accept cookies', 'accepteren', 'alles accepteren',
    'alle akzeptieren', 'akzeptieren', 'accept', 'agree', 'i agree',
    'ok', 'got it', 'close', 'sluiten', 'dismiss', 'understood',
    'alle cookies accepteren', 'toestaan', 'allow all',
    'continue', 'ja, ik ga akkoord', 'allow cookies', 'consent',
  ];
  
  // Common overlay/modal selectors
  var OVERLAY_SELECTORS = [
    '.cookie-banner', '.cookie-consent', '.cookie-notice', '.cookie-popup',
    '#cookie-banner', '#cookie-consent', '#cookie-notice', '#cookie-popup',
    '[class*="cookie-banner"]', '[class*="cookie-consent"]', '[class*="CookieConsent"]',
    '[class*="cookie-notice"]', '[id*="cookie"]',
    '.consent-banner', '#consent-banner', '[class*="consent"]',
    '[class*="gdpr"]', '#gdpr-banner',
    '[role="dialog"][class*="cookie"]', '[role="dialog"][class*="consent"]',
    '#onetrust-banner-sdk', '.onetrust-pc-dark-filter',
    '#sp-cc', '#sp-cc-rejectall-link',  // Amazon-style
    '.cc-window', '.cc-banner',  // CookieConsent.js
    '[class*="privacy-banner"]', '[class*="PrivacyBanner"]',
    '[data-testid*="cookie"]', '[data-testid*="consent"]',
  ];
  
  function tryDismiss() {
    // Strategy 1: Find and click "Accept" / "Accept All" buttons
    var buttons = Array.from(document.querySelectorAll(
      'button, a[role="button"], [role="button"], input[type="submit"], input[type="button"]'
    ));
    
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var text = (btn.textContent || btn.value || '').trim().toLowerCase();
      if (text.length > 40) continue;  // Skip long text buttons (not cookie buttons)
      
      for (var j = 0; j < DISMISS_TEXTS.length; j++) {
        if (text === DISMISS_TEXTS[j] || text.includes(DISMISS_TEXTS[j])) {
          // Check if the button is visible
          try {
            var rect = btn.getBoundingClientRect();
            var style = getComputedStyle(btn);
            if (rect.width > 0 && rect.height > 0 &&
                style.display !== 'none' && style.visibility !== 'hidden') {
              console.log('[CC-Popup] Auto-dismissed: "' + text + '"');
              btn.click();
              return true;
            }
          } catch(e) {}
        }
      }
    }
    
    // Strategy 2: Close overlay by clicking the close/X button inside it
    for (var k = 0; k < OVERLAY_SELECTORS.length; k++) {
      try {
        var overlay = document.querySelector(OVERLAY_SELECTORS[k]);
        if (!overlay) continue;
        var style = getComputedStyle(overlay);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        
        // Look for a close button inside the overlay
        var closeBtn = overlay.querySelector(
          'button[aria-label*="close"], button[aria-label*="Close"], ' +
          'button[class*="close"], button[class*="dismiss"], ' +
          '.close, .dismiss, [data-dismiss]'
        );
        if (closeBtn) {
          console.log('[CC-Popup] Closed overlay via close button');
          closeBtn.click();
          return true;
        }
      } catch(e) {}
    }
    
    return false;
  }
  
  // Run immediately
  setTimeout(tryDismiss, 500);
  setTimeout(tryDismiss, 1500);
  setTimeout(tryDismiss, 3000);
  
  // Watch for new popups appearing (exit-intent, delayed banners)
  var observer = new MutationObserver(function(mutations) {
    for (var m = 0; m < mutations.length; m++) {
      var added = mutations[m].addedNodes;
      for (var n = 0; n < added.length; n++) {
        var node = added[n];
        if (node.nodeType !== 1) continue;
        
        // Check if the new element looks like a cookie/consent overlay
        var cls = (node.className || '').toString().toLowerCase();
        var id = (node.id || '').toLowerCase();
        var role = (node.getAttribute && node.getAttribute('role') || '').toLowerCase();
        
        if (cls.includes('cookie') || cls.includes('consent') || cls.includes('gdpr') ||
            cls.includes('privacy') || cls.includes('overlay') || cls.includes('modal') ||
            id.includes('cookie') || id.includes('consent') || id.includes('gdpr') ||
            role === 'dialog' || role === 'alertdialog') {
          // Delay slightly to let the popup fully render
          setTimeout(tryDismiss, 300);
          setTimeout(tryDismiss, 800);
          return;
        }
      }
    }
  });
  
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
})();"""


def _filter_pre_form_steps(nav_steps: list) -> list:
    """
    Filter navigation steps to only include pre-form actions.
    
    We replay everything UNTIL we hit a 'continue' or 'confirm' click
    on a checkout sub-page (e.g. /checkout/summary, /checkout/address).
    Those steps happen AFTER form filling — the LLM handles them.
    """
    import re
    result = []
    for step in nav_steps:
        action = step.get('action', '')
        purpose = step.get('purpose', 'other')
        url_at = step.get('url_at', '') or ''
        
        # Skip waits (not needed for CDP script approach)
        if action == 'wait':
            continue
        
        # Stop condition: continue/confirm on a checkout sub-page
        if action == 'click' and purpose in ('continue', 'confirm'):
            if re.search(r'/checkout/.+', url_at):
                logger.info(f"   ✂️  Stopping replay before post-form step: '{step.get('text', '')[:40]}' ({purpose})")
                break
        
        result.append(step)
    
    return result


def _build_page_replay_script(pre_form_steps: list, product_url: str) -> str:
    """
    Build a JS script injected via Page.addScriptToEvaluateOnNewDocument.
    
    This script runs on EVERY page load. It checks the current URL,
    finds matching click targets from the saved navigation, and clicks them
    with retry logic. Each click that navigates to a new page causes the
    script to run again on the new page.
    
    This creates a chain reaction:
      Product page → click cookie + add to cart + continue → Cart
      Cart → click checkout → Login
      Login → click guest → Address form
      Address form → click "manual address" → DONE (LLM takes over)
    
    Total: ~15-20 seconds of pure DOM clicks, ZERO LLM calls.
    """
    from urllib.parse import urlparse
    
    # Group click steps by their URL path
    url_groups = {}
    for step in pre_form_steps:
        if step.get('action') != 'click':
            continue
        
        url_at = step.get('url_at', '') or product_url
        path = urlparse(url_at).path or '/'
        
        if path not in url_groups:
            url_groups[path] = []
        
        url_groups[path].append({
            'selector': step.get('selector', ''),
            'text': (step.get('text', '') or '')[:60],
            'aria_label': (step.get('aria_label', '') or '')[:60],
            'purpose': step.get('purpose', 'other'),
        })
    
    import json
    steps_json = json.dumps(url_groups, ensure_ascii=False)
    
    logger.info(f"   📋 Replay script: {len(url_groups)} URL groups, {sum(len(v) for v in url_groups.values())} total clicks")
    for path, clicks in url_groups.items():
        click_names = [c.get('purpose', c.get('text', '')[:20]) for c in clicks]
        logger.info(f"      {path}: {click_names}")
    
    return f"""(function() {{
  // Prevent re-execution on the same page
  if (window.__cc_replay_done) return;
  window.__cc_replay_done = true;
  
  var path = window.location.pathname;
  var steps = {steps_json};
  
  function isVis(el) {{
    if (!el) return false;
    try {{
      var s = getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0;
    }} catch(e) {{ return false; }}
  }}
  
  function doClick(target) {{
    var el = null;
    // Strategy 1: CSS selector
    if (target.selector) {{
      try {{ el = document.querySelector(target.selector); }} catch(e) {{}}
    }}
    // Strategy 2: aria-label
    if (!isVis(el) && target.aria_label) {{
      try {{ el = document.querySelector('[aria-label*="' + target.aria_label.substring(0, 30) + '"]'); }} catch(e) {{}}
    }}
    // Strategy 3: Text content
    if (!isVis(el) && target.text) {{
      var btns = Array.from(document.querySelectorAll('button, a, [role="button"], input[type="submit"]'));
      el = btns.find(function(b) {{
        return isVis(b) && (b.textContent || '').indexOf(target.text) !== -1;
      }});
    }}
    if (isVis(el)) {{
      el.scrollIntoView({{block: 'center', behavior: 'instant'}});
      el.click();
      console.log('[CC-Replay] Clicked: ' + target.purpose + ' via ' + (target.selector || target.text));
      return true;
    }}
    return false;
  }}
  
  // Find the best matching path (longest prefix match)
  var matchedPath = null;
  var matchedLen = 0;
  for (var p in steps) {{
    if (path.indexOf(p) === 0 && p.length > matchedLen) {{
      matchedPath = p;
      matchedLen = p.length;
    }}
  }}
  
  // Also try exact match
  if (!matchedPath && steps[path]) {{
    matchedPath = path;
  }}
  
  if (!matchedPath) {{
    console.log('[CC-Replay] No matching steps for path: ' + path);
    return;
  }}
  
  var targets = steps[matchedPath];
  console.log('[CC-Replay] Page: ' + path + ' → ' + targets.length + ' clicks to execute');
  
  // Execute clicks sequentially with retry
  // Each click gets up to 6 seconds (12 retries × 500ms) to find its element
  var clickIndex = 0;
  
  function executeNext() {{
    if (clickIndex >= targets.length) {{
      console.log('[CC-Replay] All clicks done for this page');
      return;
    }}
    
    var target = targets[clickIndex];
    var attempts = 0;
    var maxAttempts = 12; // 6 seconds
    
    var interval = setInterval(function() {{
      attempts++;
      if (doClick(target)) {{
        clearInterval(interval);
        clickIndex++;
        // Wait before next click (let DOM settle)
        setTimeout(executeNext, 1500);
      }} else if (attempts >= maxAttempts) {{
        clearInterval(interval);
        console.warn('[CC-Replay] Gave up on: ' + target.purpose + ' (' + target.selector + ')');
        clickIndex++;
        setTimeout(executeNext, 500);
      }}
    }}, 500);
  }}
  
  // Start after a short delay to let the page render
  setTimeout(executeNext, 1000);
}})();"""


async def _discover_and_save(browser, request, final_url, fill_results, nav_steps):
    """After success, discover selectors and save everything for next time."""
    logger.info("🔍 Discovering selectors for future checkouts...")
    
    discovered_form = {}
    discovered_payment = {}
    
    # Source 1: Selectors our tools reported as working
    if fill_results.get("form"):
        discovered_form.update(fill_results["form"])
        logger.info(f"   📋 From form tool: {list(fill_results['form'].keys())}")
    if fill_results.get("payment"):
        discovered_payment.update(fill_results["payment"])
        logger.info(f"   📋 From payment tool: {list(fill_results['payment'].keys())}")
    
    # Source 2: Scan the page
    platform = "unknown"
    try:
        page = await browser.get_current_page()
        if page:
            result_str = await page.evaluate(flow_store.DISCOVER_SELECTORS_JS)
            scanned = json.loads(result_str)
            for k, v in scanned.get("form", {}).items():
                if k not in discovered_form:
                    discovered_form[k] = v
            for k, v in scanned.get("payment", {}).items():
                if k not in discovered_payment:
                    discovered_payment[k] = v
            platform = await page.evaluate(flow_store.DETECT_PLATFORM_JS)
            logger.info(f"   🏷️ Platform: {platform}")
    except Exception as e:
        logger.warning(f"   ⚠️ Page scan failed: {e}")
    
    # Detect checkout URL pattern
    checkout_url_pattern = None
    if final_url:
        from urllib.parse import urlparse
        path = urlparse(final_url).path
        for pattern in ['/checkouts/', '/checkout/', '/cart/checkout', '/order/']:
            if pattern in path:
                checkout_url_pattern = pattern
                break
    
    # Save everything
    if discovered_form or discovered_payment or nav_steps:
        flow_store.save_flow(
            domain_or_url=request.product_url,
            form_selectors=discovered_form,
            payment_selectors=discovered_payment,
            navigation_steps=nav_steps,
            checkout_url_pattern=checkout_url_pattern,
            platform=platform,
            final_url=final_url,
        )
        
        total_sels = len(discovered_form) + len(discovered_payment)
        logger.info(f"💾 Saved {len(nav_steps)} nav steps + {total_sels} selectors for next visit!")
    
    return {"form": discovered_form, "payment": discovered_payment}


# ═══════════════════════════════════════════════════════════════════
# CLI TEST
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys
    
    url = sys.argv[1] if len(sys.argv) > 1 else "https://euploria.com/products/noble-italiana-genuine-leather-sneakers"
    headless = "--headless" in sys.argv
    
    req = CheckoutRequest(
        product_url=url,
        product_title="Test Product",
        email="test@example.com",
        shipping=ShippingAddress(
            full_name="John Doe", street="123 Test Street",
            city="Amsterdam", state="NH", zip_code="1012AB",
            country="NL", phone="+31612345678",
        ),
        card=CardDetails(
            number="4111111111111111", cvv="123",
            expiry_month="12", expiry_year="2027",
            cardholder_name="John Doe",
        ),
        dry_run=True, headless=headless, max_steps=50,
    )
    
    result = asyncio.run(run_checkout(req))
    
    print("\n" + "=" * 60)
    print("CHECKOUT RESULT")
    print("=" * 60)
    print(f"Success:        {result.success}")
    print(f"Dry-run:        {result.dry_run}")
    print(f"Time:           {result.execution_ms}ms ({result.execution_ms/1000:.1f}s)")
    print(f"Replay steps:   {result.replay_steps_used}")
    print(f"LLM steps:      {result.llm_steps}")
    print(f"Final URL:      {result.final_url}")
    if result.learned_selectors:
        form_count = len(result.learned_selectors.get('form', {}))
        pay_count = len(result.learned_selectors.get('payment', {}))
        print(f"Learned:        {form_count} form + {pay_count} payment selectors")
    if result.error:
        print(f"Error:          {result.error}")
    print("=" * 60)
