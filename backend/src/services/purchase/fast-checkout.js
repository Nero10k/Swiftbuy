const logger = require('../../utils/logger');
const { sleep } = require('../../utils/helpers');

/**
 * Fast Checkout — Universal DOM-based form filling
 *
 * SCALABLE ARCHITECTURE — works on ANY checkout website:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ For each field (email, firstName, address, etc.)               │
 *   │                                                                │
 *   │  1. SAVED selectors    — from CheckoutFlow DB (learned)        │
 *   │  2. UNIVERSAL detection — autocomplete/name/label heuristics   │
 *   │  3. PLATFORM selectors  — Shopify/WooCommerce hardcoded        │
 *   │  4. LLM fallback        — Phase 3 Computer Use handles rest    │
 *   │                                                                │
 *   │ After LLM fills remaining fields → DISCOVER selectors → SAVE  │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * Why this works on any site:
 *   HTML has standard `autocomplete` attributes (email, given-name, address-line1,
 *   postal-code, cc-number, etc.) that 95%+ of checkout forms use — because
 *   browsers use them for autofill. We piggyback on the same standard.
 *
 * Learning loop:
 *   Visit 1: universal detects ~60-80% of fields → LLM fills rest → we LEARN selectors
 *   Visit 2: saved selectors fill ~95%+ instantly → LLM only reviews
 *   Visit N: replay is nearly instant, LLM cost → $0 for form filling
 */

// ═══════════════════════════════════════════════════════════════════
// TIMEOUT HELPER
// ═══════════════════════════════════════════════════════════════════

const withTimeout = (promise, ms = 3000) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);

// ═══════════════════════════════════════════════════════════════════
// COUNTRY CODE ↔ NAME LOOKUP
// ═══════════════════════════════════════════════════════════════════

const COUNTRY_MAP = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'argentina': 'AR',
  'australia': 'AU', 'austria': 'AT', 'belgium': 'BE', 'brazil': 'BR',
  'canada': 'CA', 'chile': 'CL', 'china': 'CN', 'colombia': 'CO',
  'czech republic': 'CZ', 'czechia': 'CZ', 'denmark': 'DK', 'egypt': 'EG',
  'finland': 'FI', 'france': 'FR', 'germany': 'DE', 'greece': 'GR',
  'hong kong': 'HK', 'hungary': 'HU', 'india': 'IN', 'indonesia': 'ID',
  'ireland': 'IE', 'israel': 'IL', 'italy': 'IT', 'japan': 'JP',
  'malaysia': 'MY', 'mexico': 'MX', 'netherlands': 'NL', 'the netherlands': 'NL',
  'new zealand': 'NZ', 'norway': 'NO', 'pakistan': 'PK', 'peru': 'PE',
  'philippines': 'PH', 'poland': 'PL', 'portugal': 'PT', 'romania': 'RO',
  'russia': 'RU', 'saudi arabia': 'SA', 'singapore': 'SG', 'south africa': 'ZA',
  'south korea': 'KR', 'korea': 'KR', 'spain': 'ES', 'sweden': 'SE',
  'switzerland': 'CH', 'taiwan': 'TW', 'thailand': 'TH', 'turkey': 'TR',
  'türkiye': 'TR', 'ukraine': 'UA', 'united arab emirates': 'AE', 'uae': 'AE',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
  'united states': 'US', 'usa': 'US', 'us': 'US', 'vietnam': 'VN',
};

const CODE_TO_NAME = {};
for (const [name, code] of Object.entries(COUNTRY_MAP)) {
  if (!CODE_TO_NAME[code]) CODE_TO_NAME[code] = name;
}

function resolveCountry(val) {
  if (!val) return { code: 'US', name: 'United States', names: ['United States'] };
  const lower = val.trim().toLowerCase();
  if (val.length === 2) {
    const code = val.toUpperCase();
    const name = CODE_TO_NAME[code];
    return { code, name: name || val, names: name ? [name] : [val] };
  }
  const code = COUNTRY_MAP[lower];
  if (code) {
    const canonicalName = CODE_TO_NAME[code] || val;
    return { code, name: canonicalName, names: [val, canonicalName] };
  }
  return { code: val, name: val, names: [val] };
}

// ═══════════════════════════════════════════════════════════════════
// UNIVERSAL FIELD DETECTION (works on ANY website)
// ═══════════════════════════════════════════════════════════════════

/**
 * Scans the current page for form fields and maps them to checkout field types.
 *
 * Uses the same HTML attributes that browsers use for autofill:
 *   - autocomplete="email" → email field
 *   - autocomplete="given-name" → first name
 *   - autocomplete="address-line1" → street address
 *   - autocomplete="cc-number" → card number
 *   - etc.
 *
 * Falls back to name, placeholder, and label text if autocomplete is missing.
 *
 * @returns {Object} Map of fieldType → CSS selector
 *   e.g. { email: '#email', firstName: 'input[name="firstName"]', ... }
 */
async function universalDetectFields(page) {
  try {
    return await withTimeout(
      page.evaluate(() => {
        const fields = {};
        const elements = document.querySelectorAll('input, select, textarea');

        for (const el of elements) {
          // Skip hidden/invisible elements
          if (el.type === 'hidden' || el.offsetParent === null) continue;
          if (el.disabled || el.readOnly) continue;

          const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
          const name = (el.getAttribute('name') || '').toLowerCase();
          const id = el.getAttribute('id') || '';
          const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
          const type = (el.getAttribute('type') || '').toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();

          // Find associated label
          let labelText = '';
          if (id) {
            const label = document.querySelector(`label[for="${id}"]`);
            if (label) labelText = label.textContent.trim().toLowerCase();
          }
          // Fallback: check parent/sibling labels
          if (!labelText) {
            const parent = el.closest('label, .field, .form-group, [class*="field"]');
            if (parent) {
              const label = parent.querySelector('label, .label, legend');
              if (label && label !== el) labelText = label.textContent.trim().toLowerCase();
            }
          }

          // Build a unique, stable CSS selector
          let selector;
          if (id) {
            selector = `#${CSS.escape(id)}`;
          } else if (name && el.getAttribute('name')) {
            selector = `${el.tagName.toLowerCase()}[name="${el.getAttribute('name')}"]`;
          } else if (autocomplete) {
            selector = `${el.tagName.toLowerCase()}[autocomplete="${autocomplete}"]`;
          } else {
            continue; // Can't build a stable selector
          }

          const fieldType = identifyField(autocomplete, name, placeholder, labelText, ariaLabel, type, el.tagName.toLowerCase());
          if (fieldType && !fields[fieldType]) {
            fields[fieldType] = selector;
          }
        }

        return fields;

        function identifyField(ac, n, p, l, aria, type, tag) {
          // Combine all hints
          const all = `${ac} ${n} ${p} ${l} ${aria}`;

          // ── Email ──
          if (type === 'email' || ac === 'email' || n.includes('email') || p.includes('email'))
            return 'email';

          // ── Name ──
          if (ac === 'given-name' || n === 'firstname' || n === 'first_name' ||
              n === 'first-name' || p.includes('first name') || l.includes('first name'))
            return 'firstName';
          if (ac === 'family-name' || n === 'lastname' || n === 'last_name' ||
              n === 'last-name' || p.includes('last name') || l.includes('last name') || l.includes('surname'))
            return 'lastName';

          // ── Address ──
          if (ac === 'address-line1' || n === 'address1' || n === 'address_1' ||
              n === 'street' || n === 'address_line1' ||
              (p.includes('address') && !p.includes('address 2') && !p.includes('apt')) ||
              (l.includes('address') && !l.includes('address 2') && !l.includes('line 2')))
            return 'address';
          if (ac === 'address-line2' || n === 'address2' || n === 'address_2' ||
              p.includes('apartment') || p.includes('apt') || p.includes('suite') ||
              l.includes('apartment') || l.includes('apt') || l.includes('suite'))
            return 'apartment';

          // ── City ──
          if (ac === 'address-level2' || n === 'city' || n === 'billing_city' ||
              p.includes('city') || l.includes('city') || l.includes('town'))
            return 'city';

          // ── State / Province ──
          if (ac === 'address-level1' || n === 'zone' || n === 'state' || n === 'province' ||
              n === 'billing_state' || n === 'region' ||
              p.includes('state') || p.includes('province') || p.includes('region') ||
              l.includes('state') || l.includes('province') || l.includes('region'))
            return 'state';

          // ── ZIP / Postal Code ──
          if (ac === 'postal-code' || n === 'postalcode' || n === 'postal_code' ||
              n === 'zip' || n === 'zipcode' || n === 'billing_postcode' ||
              p.includes('zip') || p.includes('postal') || p.includes('postcode') ||
              l.includes('zip') || l.includes('postal'))
            return 'zipCode';

          // ── Country ──
          if (ac === 'country' || ac === 'country-name' || n === 'country' ||
              n === 'countrycode' || n === 'country_code' || n === 'billing_country' ||
              p.includes('country') || l.includes('country'))
            return 'country';

          // ── Phone ──
          if (type === 'tel' || ac === 'tel' || ac === 'tel-national' ||
              n === 'phone' || n === 'billing_phone' || n === 'telephone' ||
              p.includes('phone') || l.includes('phone') || l.includes('mobile'))
            return 'phone';

          // ── Payment (main page only — iframes handled separately) ──
          if (ac === 'cc-number' || n === 'cardnumber' || n === 'card_number' ||
              n === 'number' || p.includes('card number') || l.includes('card number'))
            return 'cardNumber';
          if (ac === 'cc-exp' || n === 'expiry' || n === 'cc-exp' || n === 'exp' ||
              p.includes('expir') || p.includes('mm') || l.includes('expir'))
            return 'cardExpiry';
          if (ac === 'cc-csc' || n === 'cvv' || n === 'cvc' || n === 'verification_value' ||
              n === 'security_code' || p.includes('cvv') || p.includes('cvc') ||
              p.includes('security') || l.includes('cvv') || l.includes('security code'))
            return 'cardCvv';
          if (ac === 'cc-name' || p.includes('name on card') || p.includes('cardholder') ||
              l.includes('name on card') || l.includes('cardholder'))
            return 'cardName';

          return null;
        }
      }),
      5000 // 5s timeout for page evaluation
    );
  } catch (error) {
    logger.warn(`Universal field detection failed: ${error.message}`);
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════
// POST-LLM SELECTOR DISCOVERY (learn from filled forms)
// ═══════════════════════════════════════════════════════════════════

/**
 * After the LLM has filled a form, scan the page to discover which CSS selectors
 * correspond to each filled field. These are saved to CheckoutFlow for replay.
 *
 * The key insight: we don't need to know the selector before filling — we learn
 * it AFTER the LLM fills via Computer Use, then replay it next time.
 *
 * @returns {Object} Map of fieldType → CSS selector (only for filled fields)
 */
async function discoverSelectors(page) {
  try {
    const mainPageSelectors = await withTimeout(
      page.evaluate(() => {
        const selectors = {};
        const inputs = document.querySelectorAll('input, select, textarea');

        for (const el of inputs) {
          if (el.type === 'hidden' || el.offsetParent === null) continue;
          if (!el.value && el.tagName.toLowerCase() !== 'select') continue;

          const id = el.getAttribute('id');
          const name = el.getAttribute('name');
          const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
          const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
          const type = (el.getAttribute('type') || '').toLowerCase();

          // Build selector
          let selector;
          if (id) selector = `#${CSS.escape(id)}`;
          else if (name) selector = `${el.tagName.toLowerCase()}[name="${name}"]`;
          else if (autocomplete) selector = `${el.tagName.toLowerCase()}[autocomplete="${autocomplete}"]`;
          else continue;

          // Identify field type from element attributes
          const ac = autocomplete;
          const n = (name || '').toLowerCase();
          const p = placeholder;

          let fieldType = null;
          if (type === 'email' || ac === 'email' || n.includes('email')) fieldType = 'email';
          else if (ac === 'given-name' || n === 'firstname' || n === 'first_name') fieldType = 'firstName';
          else if (ac === 'family-name' || n === 'lastname' || n === 'last_name') fieldType = 'lastName';
          else if (ac === 'address-line1' || n === 'address1' || n === 'street') fieldType = 'address';
          else if (ac === 'address-level2' || n === 'city') fieldType = 'city';
          else if (ac === 'address-level1' || n === 'zone' || n === 'state' || n === 'province') fieldType = 'state';
          else if (ac === 'postal-code' || n === 'postalcode' || n === 'zip') fieldType = 'zipCode';
          else if (ac === 'country' || n === 'country' || n === 'countrycode') fieldType = 'country';
          else if (type === 'tel' || ac === 'tel' || n === 'phone') fieldType = 'phone';
          else if (ac === 'cc-number' || n === 'cardnumber' || p.includes('card number')) fieldType = 'cardNumber';
          else if (ac === 'cc-exp' || n === 'expiry') fieldType = 'cardExpiry';
          else if (ac === 'cc-csc' || n === 'cvv' || n === 'cvc') fieldType = 'cardCvv';
          else if (ac === 'cc-name' || p.includes('name on card')) fieldType = 'cardName';

          if (fieldType && !selectors[fieldType]) {
            selectors[fieldType] = selector;
          }
        }

        return selectors;
      }),
      5000
    );

    logger.info(`📚 Discovered ${Object.keys(mainPageSelectors).length} selectors: ${Object.keys(mainPageSelectors).join(', ')}`);
    return mainPageSelectors;
  } catch (error) {
    logger.warn(`Selector discovery failed: ${error.message}`);
    return {};
  }
}

// ═══════════════════════════════════════════════════════════════════
// PLATFORM DETECTION
// ═══════════════════════════════════════════════════════════════════

async function detectPlatform(page) {
  try {
    const result = await page.evaluate(() => {
      const url = window.location.href.toLowerCase();
      const html = document.documentElement.innerHTML.substring(0, 50000).toLowerCase();

      if (
        url.includes('checkout.shopify.com') ||
        url.includes('/checkouts/') ||
        html.includes('shopify') ||
        html.includes('cdn.shopify.com') ||
        document.querySelector('[data-shopify]') ||
        (document.querySelector('#checkout') && html.includes('shopify'))
      ) return { platform: 'shopify', confidence: 0.95 };

      if (
        html.includes('woocommerce') ||
        html.includes('wc-checkout') ||
        document.querySelector('.woocommerce-checkout') ||
        document.querySelector('#billing_first_name')
      ) return { platform: 'woocommerce', confidence: 0.9 };

      if (
        html.includes('bigcommerce') ||
        document.querySelector('[data-test="checkout-payment-step"]')
      ) return { platform: 'bigcommerce', confidence: 0.85 };

      if (
        html.includes('magento') ||
        html.includes('mage-') ||
        document.querySelector('#checkout-shipping-method-load')
      ) return { platform: 'magento', confidence: 0.85 };

      return { platform: 'unknown', confidence: 0 };
    });
    return result;
  } catch (error) {
    logger.warn(`Platform detection failed: ${error.message}`);
    return { platform: 'unknown', confidence: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════
// SINGLE FIELD FILLER (with robust timeout + React event dispatch)
// ═══════════════════════════════════════════════════════════════════

/**
 * Try to fill a single field from an ordered list of selectors.
 * Each selector attempt is hard-capped at 2s.
 * After setting a value, dispatches React-compatible events.
 */
async function fillField(page, selectors, value, fieldName, options = {}) {
  if (!value) return { filled: false, selector: null };

  const { useType = false, typeDelay = 8 } = options;

  for (const selector of selectors) {
    if (!selector) continue;
    try {
      const el = await withTimeout(page.$(selector), 2000);
      if (!el) continue;

      const visible = await withTimeout(el.isVisible(), 1500).catch(() => false);
      if (!visible) continue;

      const tagName = await withTimeout(el.evaluate((e) => e.tagName.toLowerCase()), 1000);

      if (tagName === 'select') {
        const filled = await withTimeout(
          (async () => {
            try { await el.selectOption({ value }); return true; } catch {}
            try { await el.selectOption({ label: value }); return true; } catch {}
            const matchVal = await el.evaluate((sel, val) => {
              const opts = Array.from(sel.options);
              const m = opts.find(
                (o) =>
                  o.text.toLowerCase().includes(val.toLowerCase()) ||
                  o.value.toLowerCase().includes(val.toLowerCase())
              );
              return m ? m.value : null;
            }, value);
            if (matchVal) { await el.selectOption(matchVal); return true; }
            return false;
          })(),
          3000
        );
        if (!filled) continue;
        // Dispatch React events for select
        await el.evaluate((select) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
          if (setter) setter.call(select, select.value);
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('blur', { bubbles: true }));
        }).catch(() => {});
      } else if (useType) {
        await withTimeout(el.click(), 1500);
        await withTimeout(el.fill('').catch(() => {}), 1000);
        await withTimeout(el.type(value, { delay: typeDelay }), 5000);
      } else {
        await withTimeout(el.click(), 1500);
        await withTimeout(el.fill(''), 1000);
        await withTimeout(el.fill(value), 2000);
        // Dispatch React events for input
        await el.evaluate((input) => {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) setter.call(input, input.value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }).catch(() => {});
      }

      logger.info(`  ✅ ${fieldName}: filled via ${selector}`);
      return { filled: true, selector };
    } catch {
      continue;
    }
  }

  // Last resort: try scanning by label text or aria-label for common field names
  const fallbackMap = {
    city: ['input[autocomplete="address-level2"]', 'input[name="city"]', 'input[placeholder*="city" i]', 'input[placeholder*="City" i]', 'input[aria-label*="City"]'],
    zipCode: ['input[autocomplete="postal-code"]', 'input[name="postalCode"]', 'input[placeholder*="postal" i]', 'input[placeholder*="Postal" i]', 'input[placeholder*="ZIP" i]', 'input[aria-label*="Postal"]', 'input[aria-label*="ZIP"]'],
    firstName: ['input[autocomplete="given-name"]', 'input[name="firstName"]'],
    lastName: ['input[autocomplete="family-name"]', 'input[name="lastName"]'],
  };
  const fallbacks = fallbackMap[fieldName] || [];
  for (const fb of fallbacks) {
    try {
      const el = await withTimeout(page.$(fb), 1500);
      if (!el) continue;
      const visible = await withTimeout(el.isVisible(), 1000).catch(() => false);
      if (!visible) continue;
      await withTimeout(el.click(), 1500);
      await withTimeout(el.fill(''), 1000);
      await withTimeout(el.fill(value), 2000);
      await el.evaluate((input) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        if (setter) setter.call(input, input.value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }).catch(() => {});
      logger.info(`  ✅ ${fieldName}: filled via fallback ${fb}`);
      return { filled: true, selector: fb };
    } catch { continue; }
  }

  logger.warn(`  ⚠️ ${fieldName}: no matching selector`);
  return { filled: false, selector: null };
}

// ═══════════════════════════════════════════════════════════════════
// COUNTRY FILL (special handling for React frameworks)
// ═══════════════════════════════════════════════════════════════════

/**
 * Country dropdowns need special treatment:
 * - React apps ignore native selectOption → must dispatch events
 * - Some sites use combobox/typeahead instead of <select>
 * - Country codes ("NL") vs names ("Netherlands") vary by site
 */
async function fillCountry(page, code, names, selectorCandidates) {
  // Merge default selectors with any saved/detected ones
  const selectSelectors = [
    ...selectorCandidates.filter(Boolean),
    'select[name="countryCode"]',
    'select[autocomplete="country"]',
    'select[name="country"]',
    'select[name="billing_country"]',
    '#checkout_shipping_address_country',
    'select[data-address-field="country"]',
  ];

  // De-duplicate
  const uniqueSelectors = [...new Set(selectSelectors)];

  for (const selector of uniqueSelectors) {
    try {
      const el = await withTimeout(page.$(selector), 2000);
      if (!el) continue;
      const visible = await withTimeout(el.isVisible(), 1500).catch(() => false);
      if (!visible) continue;

      const tagName = await withTimeout(el.evaluate((e) => e.tagName.toLowerCase()), 1000);
      if (tagName !== 'select') continue;

      let selected = false;
      const valuesToTry = [code, ...names];

      for (const val of valuesToTry) {
        if (selected) break;
        try { await el.selectOption({ value: val }); selected = true; } catch {}
        if (!selected) try { await el.selectOption({ label: val }); selected = true; } catch {}
        if (!selected) {
          const matchVal = await el.evaluate((sel, v) => {
            const opts = Array.from(sel.options);
            const m = opts.find(
              (o) => o.text.toLowerCase().includes(v.toLowerCase()) || o.value.toLowerCase() === v.toLowerCase()
            );
            return m ? m.value : null;
          }, val);
          if (matchVal) { await el.selectOption(matchVal); selected = true; }
        }
      }

      if (!selected) continue;

      // Force React to see the change
      await el.evaluate((select) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        if (setter) setter.call(select, select.value);
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.dispatchEvent(new Event('blur', { bubbles: true }));
      });

      await sleep(300);
      const currentVal = await el.evaluate((sel) => sel.value).catch(() => '');
      if (currentVal && currentVal.toUpperCase() === code.toUpperCase()) {
        logger.info(`  ✅ country: set to ${currentVal} via ${selector}`);
        return true;
      }
      // Force-set if React didn't update
      if (currentVal !== code.toUpperCase()) {
        await el.evaluate((select, targetCode) => {
          select.value = targetCode;
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
          if (setter) setter.call(select, targetCode);
          select.dispatchEvent(new Event('input', { bubbles: true }));
          select.dispatchEvent(new Event('change', { bubbles: true }));
          select.dispatchEvent(new Event('blur', { bubbles: true }));
        }, code.toUpperCase());
        await sleep(300);
        const afterForce = await el.evaluate((sel) => sel.value).catch(() => '');
        if (afterForce?.toUpperCase() === code.toUpperCase()) {
          logger.info(`  ✅ country: force-set to ${afterForce} via ${selector}`);
          return true;
        }
      }
      // Accept partial success
      logger.info(`  ✅ country: selected via ${selector} (value: ${currentVal || '?'})`);
      return true;
    } catch { continue; }
  }

  // Fallback: combobox/typeahead input
  const comboSelectors = [
    'input[name="countryCode"]',
    '[data-address-field="country"] input',
    'input[role="combobox"][aria-label*="Country" i]',
    'input[placeholder*="Country" i]',
  ];

  for (const selector of comboSelectors) {
    try {
      const el = await withTimeout(page.$(selector), 2000);
      if (!el) continue;
      const visible = await withTimeout(el.isVisible(), 1500).catch(() => false);
      if (!visible) continue;

      const typeName = names[0] || 'Netherlands';
      await el.click();
      await el.fill('');
      await el.type(typeName, { delay: 30 });
      await sleep(600);
      await page.keyboard.press('ArrowDown');
      await sleep(200);
      await page.keyboard.press('Enter');
      await sleep(300);

      logger.info(`  ✅ country: typed "${typeName}" into combobox ${selector}`);
      return true;
    } catch { continue; }
  }

  logger.warn(`  ⚠️ country: could not fill (tried select + combobox)`);
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// UNIFIED FORM FILL — 3-source priority chain
// ═══════════════════════════════════════════════════════════════════

/**
 * MAIN ENTRY POINT for shipping form fill.
 *
 * Merges selectors from 3 sources for maximum coverage:
 *   1. savedSelectors — from CheckoutFlow DB (worked before)
 *   2. universalFields — detected on THIS page via heuristics
 *   3. platformSelectors — hardcoded for known platforms
 *
 * For each field, we try all sources in priority order.
 * Platform-specific strategies (Shopify fill order, React events, etc.)
 * are applied as wrappers around the universal fill logic.
 */
async function fastFillForm(page, platform, context, checkoutId, savedSelectors = {}) {
  logger.info(`[${checkoutId}] ⚡ Fast form fill (platform: ${platform}, saved selectors: ${Object.keys(savedSelectors).length})`);

  // Step 1: Detect fields universally on this page
  const universalFields = await universalDetectFields(page);
  logger.info(`[${checkoutId}] 🔍 Universal detection found: ${Object.keys(universalFields).join(', ') || 'none'}`);

  // Step 2: Get platform-specific selectors
  const platformSelectors = getPlatformSelectors(platform);

  // Step 3: Prepare address data with smart country/state fix
  const addr = context.address || {};
  const fullName = addr.fullName || context.user.name || '';
  const nameParts = fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || fullName;
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : firstName;

  // Smart detection: if state looks like a country name, use it as country
  let rawCountry = addr.country || 'US';
  let stateVal = addr.state;
  if ((!addr.country || addr.country === 'US') && addr.state) {
    const stateLower = addr.state.trim().toLowerCase();
    if (COUNTRY_MAP[stateLower] && COUNTRY_MAP[stateLower] !== 'US') {
      logger.info(`  🔄 Detected country "${addr.state}" stored in state field — using as country`);
      rawCountry = addr.state;
      stateVal = null; // Don't try to fill state with a country name
    }
  }

  let filledCount = 0;
  const filledFields = [];
  const missedFields = [];
  const usedSelectors = {};

  // ── Country first (changes which fields appear) ──────────────────
  const { code: countryCode, names: countryNames } = resolveCountry(rawCountry);
  const countrySelectorCandidates = [
    savedSelectors.country,
    universalFields.country,
    ...(platformSelectors.country || []),
  ];
  const countryFilled = await fillCountry(page, countryCode, countryNames, countrySelectorCandidates);
  if (countryFilled) { filledCount++; filledFields.push('country'); usedSelectors.country = 'country-filled'; }
  else missedFields.push('country');
  await sleep(1500); // Let form re-render after country change

  // Re-run universal detection AFTER country change — Shopify re-renders the form
  // with new element IDs and possibly different fields (e.g. Netherlands has no "state" field)
  const freshUniversalFields = await universalDetectFields(page);
  const freshDetected = Object.keys(freshUniversalFields).filter(k => freshUniversalFields[k]);
  if (freshDetected.length > 0) {
    logger.info(`[${checkoutId}] 🔍 Post-country re-detection found: ${freshDetected.join(', ')}`);
  }

  // ── Define field fill order ──────────────────────────────────────
  const fieldsTofill = [
    { name: 'email',     value: context.user.email },
    { name: 'firstName', value: firstName },
    { name: 'lastName',  value: lastName },
    { name: 'address',   value: addr.street },
    { name: 'city',      value: addr.city },
    { name: 'state',     value: stateVal },
    { name: 'zipCode',   value: addr.zipCode },
    { name: 'phone',     value: addr.phone || context.user.phone || '' },
  ];

  for (const field of fieldsTofill) {
    if (!field.value) continue;

    // Merge selectors from all sources (priority order)
    const candidates = [
      savedSelectors[field.name],                    // 1. Saved (highest priority)
      freshUniversalFields[field.name],              // 2. Fresh universal detection (post-country-change)
      universalFields[field.name],                   // 3. Original universal detection
      ...(platformSelectors[field.name] || []),       // 4. Platform-specific
    ].filter(Boolean);

    if (candidates.length === 0) {
      missedFields.push(field.name);
      continue;
    }

    const result = await fillField(page, candidates, field.value, field.name);
    if (result.filled) {
      filledCount++;
      filledFields.push(field.name);
      usedSelectors[field.name] = result.selector;
    } else {
      missedFields.push(field.name);
    }

    // Special: dismiss autocomplete popup after address fill
    if (field.name === 'address' && result.filled) {
      await sleep(600);
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(400);
      // Click body to fully dismiss autocomplete overlays
      await page.mouse.click(1, 1).catch(() => {});
      await sleep(800);
    } else {
      await sleep(200); // Brief pause between fields for form reactivity
    }
  }

  const totalFields = filledFields.length + missedFields.length;
  logger.info(`[${checkoutId}] ⚡ Form fill: ${filledCount}/${totalFields} fields`);
  if (missedFields.length > 0) {
    logger.info(`[${checkoutId}] ⚡ Missed: ${missedFields.join(', ')}`);
  }

  return { filledCount, totalFields, selectors: usedSelectors, filledFields, missedFields };
}

// ═══════════════════════════════════════════════════════════════════
// UNIFIED PAYMENT FILL
// ═══════════════════════════════════════════════════════════════════

async function fastFillPayment(page, platform, card, cardholderName, checkoutId, savedSelectors = {}) {
  logger.info(`[${checkoutId}] ⚡ Payment fill (platform: ${platform})`);

  // For Shopify: try iframe-based fill first
  if (platform === 'shopify') {
    const iframeResult = await shopifyFillPaymentIframes(page, card, cardholderName, checkoutId);
    if (iframeResult.filledCount >= 2) return iframeResult; // Got most fields in iframes
  }

  // Universal + saved selector approach (works for main-page payment forms)
  const universalFields = await universalDetectFields(page);
  const platformSelectors = getPlatformSelectors(platform);

  let filledCount = 0;
  const paymentFields = [
    { name: 'cardNumber', value: card.number, useType: true },
    { name: 'cardName', value: cardholderName, useType: false },
    { name: 'cardExpiry', value: card.expiry || `${card.expiryMonth}/${card.expiryYear?.slice(-2) || card.expiryYear}`, useType: true },
    { name: 'cardCvv', value: card.cvv, useType: true },
  ];

  for (const field of paymentFields) {
    const candidates = [
      savedSelectors[field.name],
      universalFields[field.name],
      ...(platformSelectors[field.name] || []),
    ].filter(Boolean);

    if (candidates.length === 0) continue;

    const result = await fillField(page, candidates, field.value, field.name, { useType: field.useType });
    if (result.filled) filledCount++;
  }

  logger.info(`[${checkoutId}] ⚡ Payment fill: ${filledCount}/4 fields`);
  return { filledCount };
}

// ═══════════════════════════════════════════════════════════════════
// SHOPIFY PAYMENT — IFRAME-AWARE FILL
// ═══════════════════════════════════════════════════════════════════

async function shopifyFillPaymentIframes(page, card, cardholderName, checkoutId) {
  logger.info(`[${checkoutId}] ⚡ Shopify payment iframe fill`);

  let filledCount = 0;
  const allFrames = page.frames();

  const fieldMap = [
    {
      label: 'cardNumber',
      urlMatch: ['card-fields', 'number'],
      selectors: ['input[name="number"]', '#number', 'input[autocomplete="cc-number"]', 'input[placeholder*="Card number"]', 'input'],
      value: card.number,
    },
    {
      label: 'cardName',
      urlMatch: ['card-fields', 'name'],
      selectors: ['input[name="name"]', '#name', 'input[autocomplete="cc-name"]', 'input[placeholder*="Name on card"]', 'input'],
      value: cardholderName,
    },
    {
      label: 'cardExpiry',
      urlMatch: ['card-fields', 'expiry'],
      selectors: ['input[name="expiry"]', '#expiry', 'input[autocomplete="cc-exp"]', 'input[placeholder*="Expiration"]', 'input[placeholder*="MM"]', 'input'],
      value: card.expiry || `${card.expiryMonth}/${card.expiryYear?.slice(-2) || card.expiryYear}`,
    },
    {
      label: 'cardCvv',
      urlMatch: ['card-fields', 'verification_value'],
      selectors: ['input[name="verification_value"]', '#verification_value', 'input[autocomplete="cc-csc"]', 'input[placeholder*="Security"]', 'input[placeholder*="CVV"]', 'input'],
      value: card.cvv,
    },
  ];

  for (const field of fieldMap) {
    let filled = false;

    for (const frame of allFrames) {
      if (filled) break;
      try {
        const frameUrl = frame.url().toLowerCase();
        if (!field.urlMatch.every((kw) => frameUrl.includes(kw))) continue;

        logger.info(`  🔍 Found ${field.label} iframe: ${frameUrl.substring(0, 80)}...`);

        for (const sel of field.selectors) {
          if (filled) break;
          try {
            const el = await withTimeout(frame.$(sel), 2000);
            if (!el) continue;
            const visible = await withTimeout(el.isVisible(), 1500).catch(() => false);
            if (!visible) continue;

            await withTimeout(el.click(), 1500);
            await withTimeout((async () => {
              await el.fill('').catch(() => {});
              await el.type(field.value, { delay: 8 });
            })(), 5000);

            filled = true;
            filledCount++;
            logger.info(`  ✅ ${field.label}: filled in iframe`);
          } catch { continue; }
        }
      } catch { continue; }
    }

    // Fallback: try main page
    if (!filled) {
      for (const sel of field.selectors.slice(0, -1)) {
        if (filled) break;
        try {
          const el = await withTimeout(page.$(sel), 2000);
          if (!el) continue;
          const visible = await withTimeout(el.isVisible(), 1500).catch(() => false);
          if (!visible) continue;

          await withTimeout(el.click(), 1500);
          await withTimeout((async () => {
            await el.fill('').catch(() => {});
            await el.type(field.value, { delay: 8 });
          })(), 5000);

          filled = true;
          filledCount++;
          logger.info(`  ✅ ${field.label}: filled on main page`);
        } catch { continue; }
      }
    }

    if (!filled) {
      logger.warn(`  ⚠️ ${field.label}: not found (LLM will handle)`);
    }
  }

  logger.info(`[${checkoutId}] ⚡ Payment fill: ${filledCount}/4 fields`);
  return { filledCount };
}

// ═══════════════════════════════════════════════════════════════════
// PLATFORM SELECTOR MAPS (fallback for when universal detection misses)
// ═══════════════════════════════════════════════════════════════════

function getPlatformSelectors(platform) {
  if (platform === 'shopify') {
    return {
      email: ['#email', 'input[name="email"]', 'input[type="email"]', 'input[autocomplete="email"]'],
      firstName: ['input[name="firstName"]', '#TextField0', 'input[autocomplete="given-name"]', '#checkout_shipping_address_first_name'],
      lastName: ['input[name="lastName"]', '#TextField1', 'input[autocomplete="family-name"]', '#checkout_shipping_address_last_name'],
      address: ['input[name="address1"]', '#shipping-address1', 'input[autocomplete="address-line1"]', '#checkout_shipping_address_address1'],
      city: ['input[name="city"]', 'input[autocomplete="address-level2"]', '#checkout_shipping_address_city'],
      state: ['select[name="zone"]', 'input[name="zone"]', 'select[autocomplete="address-level1"]', '#checkout_shipping_address_province'],
      zipCode: ['input[name="postalCode"]', 'input[autocomplete="postal-code"]', '#checkout_shipping_address_zip'],
      country: ['select[name="countryCode"]', 'select[autocomplete="country"]', '#checkout_shipping_address_country'],
      phone: ['input[name="phone"]', 'input[autocomplete="tel"]', '#checkout_shipping_address_phone'],
      cardNumber: ['input[autocomplete="cc-number"]'],
      cardExpiry: ['input[autocomplete="cc-exp"]'],
      cardCvv: ['input[autocomplete="cc-csc"]'],
      cardName: ['input[autocomplete="cc-name"]'],
    };
  }

  if (platform === 'woocommerce') {
    return {
      email: ['#billing_email', 'input[name="billing_email"]'],
      firstName: ['#billing_first_name', 'input[name="billing_first_name"]'],
      lastName: ['#billing_last_name', 'input[name="billing_last_name"]'],
      address: ['#billing_address_1', 'input[name="billing_address_1"]'],
      apartment: ['#billing_address_2', 'input[name="billing_address_2"]'],
      city: ['#billing_city', 'input[name="billing_city"]'],
      state: ['#billing_state', 'select[name="billing_state"]', 'input[name="billing_state"]'],
      zipCode: ['#billing_postcode', 'input[name="billing_postcode"]'],
      country: ['#billing_country', 'select[name="billing_country"]'],
      phone: ['#billing_phone', 'input[name="billing_phone"]'],
    };
  }

  // Unknown platform — return empty (universal detection handles it)
  return {};
}

// ═══════════════════════════════════════════════════════════════════
// CHECKOUT PAGE DETECTION
// ═══════════════════════════════════════════════════════════════════

async function isCheckoutPage(page) {
  try {
    const url = page.url().toLowerCase();
    // Strong URL signal — Shopify checkouts always have /checkouts/ in URL
    if (url.includes('/checkouts/') || url.includes('/checkout/') || url.match(/checkout\?/)) return true;

    // Weak URL signal (just "checkout" anywhere) — require at least 1 form indicator too
    const hasCheckoutInUrl = url.includes('checkout');

    // Count form indicators — require MULTIPLE to avoid false positives on product pages
    // (product pages may have a single .checkout button or newsletter email input)
    const formSignals = await withTimeout(
      page.evaluate(() => {
        let score = 0;
        // Strong form indicators (2 points each)
        if (document.querySelector('input[autocomplete="given-name"]')) score += 2;
        if (document.querySelector('input[autocomplete="family-name"]')) score += 2;
        if (document.querySelector('input[autocomplete="address-line1"]')) score += 2;
        if (document.querySelector('input[autocomplete="postal-code"]')) score += 2;
        if (document.querySelector('input[autocomplete="cc-number"]')) score += 2;
        if (document.querySelector('input[name="firstName"]')) score += 2;
        if (document.querySelector('input[name="lastName"]')) score += 2;

        // Medium indicators (1 point each)
        if (document.querySelector('input[autocomplete="email"]')) score += 1;
        if (document.querySelector('#checkout')) score += 1;

        // Weak indicators (0.5 points — common on product pages too)
        if (document.querySelector('.checkout')) score += 0;

        return score;
      }),
      3000
    ).catch(() => 0);

    // Need strong confidence: either URL + 1 form signal, or 4+ form signal points
    if (hasCheckoutInUrl && formSignals >= 1) return true;
    if (formSignals >= 4) return true;

    return false;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════

module.exports = {
  detectPlatform,
  universalDetectFields,
  discoverSelectors,
  fastFillForm,
  fastFillPayment,
  isCheckoutPage,
  resolveCountry,
};
