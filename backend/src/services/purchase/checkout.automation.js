const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk').default;
const CheckoutFlow = require('../../models/CheckoutFlow');
const config = require('../../config');
const logger = require('../../utils/logger');
const { sleep, generateId } = require('../../utils/helpers');

/**
 * Checkout Automation Engine
 *
 * AI-driven browser automation that completes real purchases on any
 * e-commerce website. Uses a screenshot→LLM→action loop:
 *
 *   1. Take screenshot of the current page
 *   2. Send to Claude with checkout context (product, address, card)
 *   3. Claude responds with the next action (click, fill, select...)
 *   4. Execute the action with Playwright
 *   5. Repeat until order is confirmed
 *
 * Checkout Memory:
 *   - First checkout on a domain: LLM-guided (~10-15 steps, ~$0.10)
 *   - Subsequent checkouts: replay saved flow (0 LLM calls, ~$0.00)
 *   - If saved step fails: LLM fallback for that step, update flow
 */
class CheckoutAutomation {
  constructor() {
    this.anthropic = config.checkout.anthropicApiKey
      ? new Anthropic({ apiKey: config.checkout.anthropicApiKey })
      : null;
    this.model = config.checkout.model;
    this.maxSteps = config.checkout.maxSteps;
    this.timeoutMs = config.checkout.timeoutMs;
  }

  /**
   * Execute checkout on a retailer website
   *
   * @param {Object} order - Order document (product URL, title, price, etc.)
   * @param {Object} cardDetails - { number, cvv, expiry, expiryMonth, expiryYear }
   * @param {Object} shippingAddress - { fullName, street, city, state, zipCode, country, phone }
   * @param {Object} user - { email, name }
   * @returns {{ success, retailerOrderId, confirmationUrl, executionMs, llmCalls, usedSavedFlow }}
   */
  async executeCheckout(order, cardDetails, shippingAddress, user) {
    if (!this.anthropic) {
      throw new Error('Checkout engine not configured: ANTHROPIC_API_KEY is missing');
    }

    const productUrl = order.product.url;
    if (!productUrl) {
      throw new Error('Product URL is required for automated checkout');
    }

    const domain = new URL(productUrl).hostname.replace('www.', '');
    const startTime = Date.now();
    const checkoutId = generateId('chk');

    logger.info(`[${checkoutId}] Starting checkout on ${domain} for order ${order.orderId}`);

    // Build checkout context for the LLM
    const context = {
      product: {
        title: order.product.title,
        price: order.product.price,
        url: productUrl,
      },
      card: {
        number: cardDetails.number,
        cvv: cardDetails.cvv,
        expiry: cardDetails.expiry,
        expiryMonth: cardDetails.expiryMonth,
        expiryYear: cardDetails.expiryYear,
      },
      address: shippingAddress,
      user: { email: user.email, name: user.name },
    };

    let browser = null;
    let result = null;

    try {
      // Launch browser
      browser = await this._launchBrowser();
      const page = await browser.newPage();

      // Set reasonable viewport and user agent
      await page.setViewportSize({ width: 1366, height: 768 });

      // Check for saved flow
      const savedFlow = await CheckoutFlow.findOne({ domain });

      if (savedFlow && savedFlow.successCount > 0 && savedFlow.steps.length > 0) {
        // Try the saved flow first
        logger.info(`[${checkoutId}] Attempting saved flow for ${domain} (${savedFlow.steps.length} steps, ${savedFlow.successCount} prior successes)`);
        result = await this._executeSavedFlow(page, savedFlow, context, checkoutId);

        if (result.success) {
          const executionMs = Date.now() - startTime;
          await savedFlow.recordSuccess(executionMs);
          logger.info(`[${checkoutId}] ✅ Saved flow succeeded on ${domain} in ${executionMs}ms`);
          return { ...result, executionMs, llmCalls: 0, usedSavedFlow: true };
        }

        // Saved flow failed — fall through to LLM-guided
        logger.warn(`[${checkoutId}] Saved flow failed on step ${result.failedStep}: ${result.error}. Falling back to LLM.`);
        await savedFlow.recordFailure(result.error, result.failedStep);

        // Navigate back to product URL for fresh start
        await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      }

      // LLM-guided checkout
      logger.info(`[${checkoutId}] Running LLM-guided checkout on ${domain}`);
      result = await this._executeLLMCheckout(page, context, checkoutId);

      if (result.success) {
        const executionMs = Date.now() - startTime;

        // Save the learned flow
        await this._saveFlow(domain, result.recordedSteps, result.flags);
        logger.info(`[${checkoutId}] ✅ LLM checkout succeeded on ${domain} in ${executionMs}ms (${result.llmCalls} LLM calls, ${result.recordedSteps.length} steps recorded)`);

        return { ...result, executionMs, usedSavedFlow: false };
      }

      throw new Error(result.error || 'Checkout failed — could not complete purchase');
    } catch (error) {
      const executionMs = Date.now() - startTime;
      logger.error(`[${checkoutId}] ❌ Checkout failed on ${domain}: ${error.message}`, { executionMs });
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     BROWSER MANAGEMENT
     ═══════════════════════════════════════════════════════════════════ */

  async _launchBrowser() {
    const launchOptions = {
      headless: config.checkout.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    };

    // Add proxy if configured
    if (config.checkout.proxyUrl) {
      launchOptions.proxy = { server: config.checkout.proxyUrl };
    }

    return chromium.launch(launchOptions);
  }

  /* ═══════════════════════════════════════════════════════════════════
     LLM-GUIDED CHECKOUT (first time on a domain)
     ═══════════════════════════════════════════════════════════════════ */

  async _executeLLMCheckout(page, context, checkoutId) {
    const recordedSteps = [];
    let llmCalls = 0;
    let currentPhase = 'product';
    let flags = {};
    const deadline = Date.now() + this.timeoutMs;

    // Navigate to product page
    await page.goto(context.product.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000); // Let page render

    for (let step = 0; step < this.maxSteps; step++) {
      if (Date.now() > deadline) {
        return { success: false, error: 'Checkout timed out', recordedSteps, llmCalls };
      }

      // Take screenshot
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 75 });
      const screenshotBase64 = screenshot.toString('base64');
      const currentUrl = page.url();

      // Ask Claude what to do
      llmCalls++;
      const action = await this._askLLM(screenshotBase64, currentUrl, context, currentPhase, step, checkoutId);

      if (!action) {
        return { success: false, error: 'LLM returned no action', recordedSteps, llmCalls };
      }

      // Check if checkout is complete
      if (action.type === 'done') {
        return {
          success: true,
          retailerOrderId: action.orderNumber || null,
          confirmationUrl: currentUrl,
          recordedSteps,
          llmCalls,
          flags,
        };
      }

      // Check if checkout failed
      if (action.type === 'error') {
        return {
          success: false,
          error: action.message || 'LLM detected an error on the page',
          recordedSteps,
          llmCalls,
        };
      }

      // Update phase
      if (action.phase) {
        currentPhase = action.phase;
      }

      // Update flags
      if (action.flags) {
        flags = { ...flags, ...action.flags };
      }

      // Execute the action
      logger.info(`[${checkoutId}] Step ${step + 1}: ${action.type} ${action.selector || action.value || ''} (phase: ${currentPhase})`);

      try {
        await this._executeAction(page, action, context);

        // Record the step
        recordedSteps.push({
          index: step,
          phase: currentPhase,
          action: {
            type: action.type,
            selector: action.selector,
            textContent: action.textContent,
            value: action.valueTemplate || action.value, // Template for replay
            key: action.key,
            url: action.url,
            waitMs: action.waitMs,
            waitForSelector: action.waitForSelector,
          },
          expectedUrlPattern: this._urlToPattern(currentUrl),
        });

        // Wait for page to settle
        await sleep(action.waitMs || 1500);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      } catch (execError) {
        logger.warn(`[${checkoutId}] Action failed at step ${step + 1}: ${execError.message}`);
        // Don't abort — let the LLM see the result and decide next action
        await sleep(1000);
      }
    }

    return {
      success: false,
      error: `Reached max steps (${this.maxSteps}) without completing checkout`,
      recordedSteps,
      llmCalls,
    };
  }

  /**
   * Ask Claude to analyze a screenshot and return the next action
   */
  async _askLLM(screenshotBase64, currentUrl, context, phase, stepNumber, checkoutId) {
    const systemPrompt = `You are an expert e-commerce checkout agent. Your job is to complete an online purchase.

You will see a screenshot of a web page. Analyze it and return the SINGLE next action to take.

## Context
- Product: "${context.product.title}" at $${context.product.price}
- Current URL: ${currentUrl}
- Current phase: ${phase}
- Step number: ${stepNumber + 1}

## Shipping Address
- Name: ${context.address?.fullName || context.user.name}
- Street: ${context.address?.street || 'N/A'}
- City: ${context.address?.city || 'N/A'}
- State: ${context.address?.state || 'N/A'}
- ZIP: ${context.address?.zipCode || 'N/A'}
- Country: ${context.address?.country || 'US'}
- Phone: ${context.address?.phone || 'N/A'}
- Email: ${context.user.email}

## Payment Card
- Number: ${context.card.number}
- Expiry: ${context.card.expiryMonth}/${context.card.expiryYear}
- CVV: ${context.card.cvv}

## Rules
1. ALWAYS choose guest checkout over login/create account when available
2. NEVER create an account — we are a guest
3. Fill one field at a time — each response is ONE action
4. If you see a cookie banner or popup, dismiss it first
5. If a size/variant needs to be selected, pick what matches the product title
6. Before submitting payment, VERIFY the cart total is close to $${context.product.price} (±15% for tax/shipping)
7. If the total is way off, return an error
8. If you see an order confirmation page with an order number, return "done"

## Response Format
Return ONLY valid JSON (no markdown, no explanation):

For clicking:
{"type":"click","selector":"CSS_SELECTOR","textContent":"VISIBLE_TEXT","phase":"PHASE"}

For filling a text field:
{"type":"fill","selector":"CSS_SELECTOR","value":"THE_VALUE","valueTemplate":"TEMPLATE_VAR","phase":"PHASE"}

For selecting a dropdown option:
{"type":"select","selector":"CSS_SELECTOR","value":"OPTION_VALUE","phase":"PHASE"}

For pressing a key:
{"type":"press_key","key":"Enter","phase":"PHASE"}

For scrolling down to see more:
{"type":"scroll","phase":"PHASE"}

For completion:
{"type":"done","orderNumber":"ORDER_123","phase":"confirmation"}

For errors (out of stock, card declined, etc.):
{"type":"error","message":"WHAT_WENT_WRONG"}

valueTemplate uses variables like: {card.number}, {card.cvv}, {card.expiryMonth}, {card.expiryYear}, {address.fullName}, {address.street}, {address.city}, {address.state}, {address.zipCode}, {address.country}, {address.phone}, {user.email}

Phase must be one of: product, cart, checkout, shipping, payment, review, confirmation, other`;

    try {
      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: screenshotBase64,
                },
              },
              {
                type: 'text',
                text: `What is the next action to complete this checkout? Current phase: ${phase}, step: ${stepNumber + 1}. Return ONLY JSON.`,
              },
            ],
          },
        ],
        system: systemPrompt,
      });

      const text = response.content[0]?.text?.trim();
      if (!text) return null;

      // Parse JSON — handle Claude sometimes wrapping in markdown
      const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const action = JSON.parse(jsonStr);

      return action;
    } catch (error) {
      logger.error(`[${checkoutId}] LLM call failed: ${error.message}`);
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SAVED FLOW REPLAY (repeat checkouts — no LLM needed)
     ═══════════════════════════════════════════════════════════════════ */

  async _executeSavedFlow(page, flow, context, checkoutId) {
    // Navigate to product URL
    await page.goto(context.product.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(2000);

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];

      // Skip unreliable steps (let LLM handle via fallback if needed)
      if (step.reliability < 0.3) {
        logger.warn(`[${checkoutId}] Skipping unreliable step ${i} (reliability: ${step.reliability})`);
        continue;
      }

      try {
        // Resolve template variables in the value
        const resolvedAction = this._resolveTemplates(step.action, context);

        logger.info(`[${checkoutId}] Replay step ${i + 1}/${flow.steps.length}: ${resolvedAction.type} ${resolvedAction.selector || ''}`);

        await this._executeAction(page, resolvedAction, context);

        // Mark step as successful
        step.successCount += 1;
        step.reliability = step.successCount / (step.successCount + step.failCount);

        // Wait for page to settle
        await sleep(resolvedAction.waitMs || 1500);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
      } catch (error) {
        return {
          success: false,
          failedStep: i,
          error: `Step ${i + 1} failed: ${error.message}`,
        };
      }
    }

    // Check if we're on a confirmation page
    const confirmationCheck = await this._checkForConfirmation(page);
    if (confirmationCheck.isConfirmation) {
      return {
        success: true,
        retailerOrderId: confirmationCheck.orderNumber,
        confirmationUrl: page.url(),
      };
    }

    return {
      success: false,
      error: 'Saved flow completed but no confirmation page detected',
      failedStep: flow.steps.length - 1,
    };
  }

  /**
   * Replace template variables like {card.number} with actual values
   */
  _resolveTemplates(action, context) {
    const resolved = { ...action };

    if (resolved.value && typeof resolved.value === 'string') {
      resolved.value = resolved.value
        .replace('{card.number}', context.card.number || '')
        .replace('{card.cvv}', context.card.cvv || '')
        .replace('{card.expiry}', context.card.expiry || '')
        .replace('{card.expiryMonth}', context.card.expiryMonth || '')
        .replace('{card.expiryYear}', context.card.expiryYear || '')
        .replace('{address.fullName}', context.address?.fullName || context.user.name || '')
        .replace('{address.street}', context.address?.street || '')
        .replace('{address.city}', context.address?.city || '')
        .replace('{address.state}', context.address?.state || '')
        .replace('{address.zipCode}', context.address?.zipCode || '')
        .replace('{address.country}', context.address?.country || 'US')
        .replace('{address.phone}', context.address?.phone || '')
        .replace('{user.email}', context.user.email || '')
        .replace('{user.name}', context.user.name || '');
    }

    return resolved;
  }

  /* ═══════════════════════════════════════════════════════════════════
     ACTION EXECUTION (shared between LLM-guided and saved flow)
     ═══════════════════════════════════════════════════════════════════ */

  async _executeAction(page, action, context) {
    // Wait for selector if specified
    if (action.waitForSelector) {
      await page.waitForSelector(action.waitForSelector, { timeout: 10000 });
    }

    switch (action.type) {
      case 'click': {
        if (action.selector) {
          // Try CSS selector first
          const el = await page.$(action.selector).catch(() => null);
          if (el) {
            await el.click();
            return;
          }
        }
        // Fall back to text content
        if (action.textContent) {
          await page.getByText(action.textContent, { exact: false }).first().click();
          return;
        }
        throw new Error(`Could not find element to click: ${action.selector || action.textContent}`);
      }

      case 'fill': {
        // Resolve template value if it's a template
        let value = action.value;
        if (value && value.startsWith('{') && value.endsWith('}')) {
          const resolved = this._resolveTemplates({ value }, context);
          value = resolved.value;
        }

        if (action.selector) {
          const el = await page.$(action.selector).catch(() => null);
          if (el) {
            await el.click();
            await el.fill(''); // Clear first
            await el.fill(value);
            return;
          }
        }
        throw new Error(`Could not find field to fill: ${action.selector}`);
      }

      case 'select': {
        if (action.selector) {
          await page.selectOption(action.selector, action.value);
          return;
        }
        throw new Error(`Could not find dropdown: ${action.selector}`);
      }

      case 'press_key': {
        await page.keyboard.press(action.key || 'Enter');
        return;
      }

      case 'scroll': {
        await page.evaluate(() => window.scrollBy(0, 500));
        return;
      }

      case 'navigate': {
        if (action.url) {
          await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
        return;
      }

      case 'wait': {
        await sleep(action.waitMs || 2000);
        return;
      }

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     FLOW PERSISTENCE (save learned flows to MongoDB)
     ═══════════════════════════════════════════════════════════════════ */

  async _saveFlow(domain, steps, flags = {}) {
    try {
      const existing = await CheckoutFlow.findOne({ domain });

      if (existing) {
        // Update existing flow with new steps
        existing.steps = steps;
        existing.successCount += 1;
        existing.lastSuccessAt = new Date();
        if (flags) {
          existing.flags = { ...existing.flags.toObject?.() || existing.flags, ...flags };
        }
        await existing.save();
        logger.info(`Updated checkout flow for ${domain} (${steps.length} steps)`);
      } else {
        // Create new flow
        await CheckoutFlow.create({
          domain,
          steps,
          successCount: 1,
          lastSuccessAt: new Date(),
          flags: {
            isShopify: domain.includes('myshopify') || false,
            ...flags,
          },
        });
        logger.info(`Saved new checkout flow for ${domain} (${steps.length} steps)`);
      }
    } catch (error) {
      logger.error(`Failed to save checkout flow for ${domain}: ${error.message}`);
      // Don't throw — saving the flow is not critical to checkout success
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     SAFETY CHECKS
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Verify the cart contents before submitting payment
   */
  async verifySafety(page, expectedPrice, checkoutId) {
    try {
      const screenshot = await page.screenshot({ type: 'jpeg', quality: 75 });
      const screenshotBase64 = screenshot.toString('base64');

      const response = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: screenshotBase64,
                },
              },
              {
                type: 'text',
                text: `This is a checkout/review page. The expected total is approximately $${expectedPrice.toFixed(2)} (±15% for tax/shipping is acceptable).

Please verify:
1. Is this a checkout or order review page?
2. What is the total amount shown?
3. Is the total within the acceptable range?

Return ONLY JSON:
{"isCheckoutPage": true/false, "totalFound": 123.45, "withinRange": true/false, "safe": true/false, "reason": "explanation"}`,
              },
            ],
          },
        ],
      });

      const text = response.content[0]?.text?.trim();
      const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
      const result = JSON.parse(jsonStr);

      logger.info(`[${checkoutId}] Safety check: total=$${result.totalFound}, safe=${result.safe}`);
      return result;
    } catch (error) {
      logger.error(`[${checkoutId}] Safety check failed: ${error.message}`);
      // If safety check fails, be conservative and block
      return { safe: false, reason: `Safety check error: ${error.message}` };
    }
  }

  /**
   * Check if the current page is a confirmation page
   */
  async _checkForConfirmation(page) {
    try {
      const pageText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
      const url = page.url().toLowerCase();

      // Common confirmation indicators
      const confirmationKeywords = [
        'order confirmed', 'order placed', 'thank you for your order',
        'order number', 'confirmation number', 'order #',
        'your order has been placed', 'purchase complete',
        'order successful', 'thanks for your purchase',
      ];

      const isConfirmation = confirmationKeywords.some(
        (kw) => pageText.toLowerCase().includes(kw)
      ) || url.includes('confirm') || url.includes('thank');

      // Try to extract order number
      let orderNumber = null;
      const orderMatch = pageText.match(/(?:order|confirmation)\s*(?:#|number|:)\s*([A-Z0-9-]+)/i);
      if (orderMatch) {
        orderNumber = orderMatch[1];
      }

      return { isConfirmation, orderNumber };
    } catch (error) {
      return { isConfirmation: false, orderNumber: null };
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     UTILITIES
     ═══════════════════════════════════════════════════════════════════ */

  /**
   * Convert a URL to a pattern for matching (strip dynamic parts)
   */
  _urlToPattern(url) {
    try {
      const parsed = new URL(url);
      // Keep host and path, strip query params and fragments
      return `${parsed.hostname}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Check if the checkout engine is configured and ready
   */
  isReady() {
    return !!this.anthropic;
  }
}

module.exports = new CheckoutAutomation();
