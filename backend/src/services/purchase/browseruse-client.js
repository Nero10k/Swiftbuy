/**
 * Browser Use Checkout Client
 * 
 * Calls the Python checkout agent (FastAPI) running on localhost:8100.
 * This replaces the Anthropic Computer Use approach with browser-use,
 * which is cheaper, faster, and more reliable.
 * 
 * Learning loop integration:
 *   1. Before checkout → loads saved selectors from MongoDB (CheckoutFlow)
 *   2. Passes them to the Python agent as `saved_form_selectors`
 *   3. After checkout → receives `learned_selectors` back from the agent
 *   4. Saves them to MongoDB for future use
 * 
 * Architecture:
 *   Node.js backend → HTTP POST → Python FastAPI → browser-use Agent → Browser
 */

const logger = require('../../utils/logger');

const AGENT_URL = process.env.CHECKOUT_AGENT_URL || 'http://localhost:8100';
const AGENT_TIMEOUT = parseInt(process.env.CHECKOUT_AGENT_TIMEOUT, 10) || 300000; // 5 min

let CheckoutFlow;
try {
  CheckoutFlow = require('../../models/CheckoutFlow');
} catch (e) {
  logger.warn('CheckoutFlow model not available — selector learning will only use local JSON store');
}

class BrowserUseClient {
  constructor() {
    this.baseUrl = AGENT_URL;
    this.timeout = AGENT_TIMEOUT;
  }

  /**
   * Extract domain from a URL
   */
  _extractDomain(url) {
    try {
      const parsed = new URL(url);
      let domain = parsed.hostname;
      if (domain.startsWith('www.')) domain = domain.slice(4);
      return domain;
    } catch {
      return null;
    }
  }

  /**
   * Load saved selectors from MongoDB for a domain
   */
  async _loadSavedSelectors(domain) {
    if (!CheckoutFlow || !domain) return { form: null, payment: null };

    try {
      const flow = await CheckoutFlow.findOne({ domain, status: 'active' });
      if (!flow) return { form: null, payment: null };

      // Convert Mongoose Map to plain object
      const formSelectors = flow.formSelectors
        ? Object.fromEntries(flow.formSelectors)
        : null;

      logger.info(`📬 [BrowserUse] Loaded ${Object.keys(formSelectors || {}).length} saved selectors from MongoDB for ${domain}`);

      return {
        form: formSelectors,
        payment: null, // Payment selectors are stored in the Python flow store
        platform: flow.platform,
        successCount: flow.successCount,
      };
    } catch (err) {
      logger.warn(`Failed to load saved selectors for ${domain}: ${err.message}`);
      return { form: null, payment: null };
    }
  }

  /**
   * Save learned selectors to MongoDB after a successful checkout
   */
  async _saveLearnedSelectors(domain, learnedSelectors, platform) {
    if (!CheckoutFlow || !domain || !learnedSelectors) return;

    try {
      const formSelectors = learnedSelectors.form || {};
      const paymentSelectors = learnedSelectors.payment || {};

      // Upsert: create or merge with existing
      const existing = await CheckoutFlow.findOne({ domain });

      if (existing) {
        // Merge selectors (new wins on conflict)
        const mergedForm = new Map([
          ...(existing.formSelectors || new Map()),
          ...Object.entries(formSelectors),
        ]);

        existing.formSelectors = mergedForm;
        existing.platform = platform || existing.platform;
        existing.successCount = (existing.successCount || 0) + 1;
        existing.lastSuccessAt = new Date();
        existing.status = 'active';

        await existing.save();
        logger.info(`💾 [BrowserUse] Updated MongoDB flow for ${domain} — ${mergedForm.size} selectors, ${existing.successCount} successes`);
      } else {
        // Create new flow
        await CheckoutFlow.create({
          domain,
          platform: platform || 'unknown',
          formSelectors: new Map(Object.entries(formSelectors)),
          status: 'active',
          successCount: 1,
          lastSuccessAt: new Date(),
        });
        logger.info(`💾 [BrowserUse] Created MongoDB flow for ${domain} — ${Object.keys(formSelectors).length} selectors`);
      }
    } catch (err) {
      logger.warn(`Failed to save learned selectors for ${domain}: ${err.message}`);
    }
  }

  /**
   * Check if the checkout agent is running
   */
  async isReady() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      
      if (!res.ok) return false;
      const data = await res.json();
      return data.status === 'ok';
    } catch (err) {
      logger.warn('Checkout agent not reachable:', err.message);
      return false;
    }
  }

  /**
   * Execute a checkout via the browser-use agent
   * 
   * @param {Object} order - { product: { url, title, price } }
   * @param {Object} cardDetails - { number, cvv, expiryMonth, expiryYear }
   * @param {Object} shippingAddress - { fullName, street, city, state, zipCode, country, phone }
   * @param {Object} userContext - { email, name }
   * @param {Object} options - { dryRun: boolean, headless: boolean }
   * @returns {Object} - { success, orderId, finalUrl, executionMs, llmSteps, error }
   */
  async executeCheckout(order, cardDetails, shippingAddress, userContext, options = {}) {
    const { dryRun = true, headless = false } = options;
    const productUrl = order.product?.url;
    const domain = this._extractDomain(productUrl);

    // ── Load saved selectors from MongoDB ──────────────────────
    const saved = await this._loadSavedSelectors(domain);

    const requestBody = {
      product_url: productUrl,
      product_title: order.product?.title || 'Product',
      email: userContext?.email || '',
      shipping: {
        full_name: shippingAddress?.fullName || userContext?.name || '',
        street: shippingAddress?.street || '',
        city: shippingAddress?.city || '',
        state: shippingAddress?.state || '',
        zip_code: shippingAddress?.zipCode || '',
        country: shippingAddress?.country || 'US',
        phone: shippingAddress?.phone || userContext?.phone || '',
      },
      card: {
        number: cardDetails?.number || '',
        cvv: cardDetails?.cvv || '',
        expiry_month: cardDetails?.expiryMonth || '',
        expiry_year: cardDetails?.expiryYear || '',
        cardholder_name: shippingAddress?.fullName || userContext?.name || '',
      },
      dry_run: dryRun,
      headless: headless,
      max_steps: 50,
      // Pass saved selectors from MongoDB to the Python agent
      saved_form_selectors: saved.form || undefined,
      saved_payment_selectors: saved.payment || undefined,
    };

    const visitType = saved.form ? `repeat visit (#${(saved.successCount || 0) + 1})` : 'first visit';
    logger.info(`🛒 [BrowserUse] Starting checkout: ${productUrl} (${visitType})`);
    logger.info(`   dry_run=${dryRun}, headless=${headless}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const res = await fetch(`${this.baseUrl}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Checkout agent returned ${res.status}: ${errorText}`);
      }

      const result = await res.json();

      logger.info(`${result.success ? '✅' : '❌'} [BrowserUse] Result: success=${result.success}, ${result.execution_ms}ms, ${result.llm_steps} steps`);

      // ── Save learned selectors to MongoDB ──────────────────
      if (result.success && result.learned_selectors) {
        await this._saveLearnedSelectors(domain, result.learned_selectors, saved.platform);
      }

      return {
        success: result.success,
        retailerOrderId: result.order_id,
        confirmationUrl: result.final_url,
        executionMs: result.execution_ms,
        llmCalls: result.llm_steps,
        error: result.error,
        usedSavedFlow: !!saved.form,
        learnedSelectors: result.learned_selectors,
        recordedSteps: [],
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        logger.error(`[BrowserUse] Checkout timed out after ${this.timeout}ms`);
        return {
          success: false,
          error: `Checkout timed out after ${this.timeout / 1000}s`,
          executionMs: this.timeout,
          llmCalls: 0,
        };
      }
      logger.error(`[BrowserUse] Checkout error: ${err.message}`);
      return {
        success: false,
        error: err.message,
        executionMs: 0,
        llmCalls: 0,
      };
    }
  }
}

module.exports = new BrowserUseClient();
