const { chromium } = require('playwright');
const Anthropic = require('@anthropic-ai/sdk').default;
const CheckoutFlow = require('../../models/CheckoutFlow');
const fastCheckout = require('./fast-checkout');
const browserUseClient = require('./browseruse-client');
const config = require('../../config');
const logger = require('../../utils/logger');
const { sleep, generateId } = require('../../utils/helpers');

/**
 * Checkout Automation Engine
 *
 * Two engines available:
 *   1. Browser Use Agent (PRIMARY) — Python FastAPI + browser-use library
 *      - Cheaper, faster, learns checkout flows
 *      - Requires the Python sidecar running on port 8100
 *   2. Anthropic Computer Use (FALLBACK) — Claude vision + Playwright
 *      - More expensive, slower, but no external dependency
 *      - Direct screenshot→action loop
 *
 * The engine auto-selects:
 *   - If Python agent is running → Browser Use (learn once, replay forever)
 *   - If not → Anthropic Computer Use (coordinate-based)
 *   - If neither → mock/error
 */

const VIEWPORT = { width: 1366, height: 768 };
const BETA_FLAG = 'computer-use-2025-01-24';
const COMPUTER_TOOL = {
  type: 'computer_20250124',
  name: 'computer',
  display_width_px: VIEWPORT.width,
  display_height_px: VIEWPORT.height,
};

class CheckoutAutomation {
  constructor() {
    this.anthropic = config.checkout.anthropicApiKey
      ? new Anthropic({ apiKey: config.checkout.anthropicApiKey })
      : null;
    this.model = config.checkout.model;
    this.maxTurns = config.checkout.maxSteps || 25;
    this.timeoutMs = config.checkout.timeoutMs || 120000;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Execute checkout on a retailer website
   *
   * @param {Object} order - Order document (product URL, title, price, etc.)
   * @param {Object} cardDetails - { number, cvv, expiry, expiryMonth, expiryYear }
   * @param {Object} shippingAddress - { fullName, street, city, state, zipCode, country, phone }
   * @param {Object} user - { email, name }
   * @returns {{ success, retailerOrderId, confirmationUrl, executionMs, llmCalls, usedSavedFlow }}
   */
  async executeCheckout(order, cardDetails, shippingAddress, user, options = {}) {
    const productUrl = order.product.url;
    if (!productUrl) {
      throw new Error('Product URL is required for automated checkout');
    }

    const dryRun = options.dryRun || false;
    const domain = new URL(productUrl).hostname.replace('www.', '');
    const startTime = Date.now();
    const checkoutId = generateId('chk');

    // ═══════════════════════════════════════════════════════════════
    // TRY BROWSER USE AGENT FIRST (Primary — cheaper, faster, learns)
    // ═══════════════════════════════════════════════════════════════
    const browserUseAvailable = await this._isBrowserUseAvailable();
    
    if (browserUseAvailable) {
      logger.info(`[${checkoutId}] 🚀 Using Browser Use agent for ${domain} (order: ${order.orderId})`);
      try {
        const result = await browserUseClient.executeCheckout(
          order,
          cardDetails,
          shippingAddress,
          user,
          { dryRun, headless: config.checkout.headless }
        );
        
        logger.info(`[${checkoutId}] Browser Use result:`, {
          success: result.success,
          executionMs: result.executionMs,
          llmCalls: result.llmCalls,
          usedSavedFlow: result.usedSavedFlow,
          error: result.error,
        });

        if (result.success) {
          return result;
        }
        
        // If Browser Use failed, decide whether to fall back
        if (this.anthropic) {
          logger.warn(`[${checkoutId}] Browser Use failed (${result.error}), falling back to Anthropic Computer Use`);
          // Fall through to the old engine below
        } else {
          // No fallback available — return the Browser Use result as-is
          return result;
        }
      } catch (buError) {
        if (this.anthropic) {
          logger.warn(`[${checkoutId}] Browser Use error (${buError.message}), falling back to Anthropic Computer Use`);
        } else {
          throw buError;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // FALLBACK: ANTHROPIC COMPUTER USE (Legacy — more expensive)
    // ═══════════════════════════════════════════════════════════════
    if (!this.anthropic) {
      throw new Error('No checkout engine available: Browser Use agent is not running and ANTHROPIC_API_KEY is missing');
    }

    logger.info(`[${checkoutId}] Starting ${dryRun ? '🧪 DRY-RUN ' : ''}Anthropic Computer Use checkout on ${domain} for order ${order.orderId}`);

    // ── Smart country resolution ──────────────────────────────────
    // If "state" field contains a country name (e.g. "Netherlands") and
    // "country" is missing or defaulted to 'US', swap them automatically.
    const resolvedAddress = { ...shippingAddress };
    if (resolvedAddress.state && (!resolvedAddress.country || resolvedAddress.country === 'US')) {
      const stateAsCountry = fastCheckout.resolveCountry?.(resolvedAddress.state);
      if (stateAsCountry && stateAsCountry.code !== 'US') {
        logger.info(`[${checkoutId}] 🔄 Smart country fix: state="${resolvedAddress.state}" → country="${stateAsCountry.name}" (${stateAsCountry.code})`);
        resolvedAddress.country = stateAsCountry.code;
        resolvedAddress.state = ''; // Clear state since it was actually a country
      }
    }

    const context = {
      product: { title: order.product.title, price: order.product.price, url: productUrl },
      card: {
        number: cardDetails.number,
        cvv: cardDetails.cvv,
        expiry: cardDetails.expiry,
        expiryMonth: cardDetails.expiryMonth,
        expiryYear: cardDetails.expiryYear,
      },
      address: resolvedAddress,
      user: { email: user.email, name: user.name, profile: user.profile || {}, phone: user.phone || resolvedAddress?.phone || '' },
      dryRun,
    };

    let browser = null;
    let totalLlmCalls = 0;

    try {
      browser = await this._launchBrowser();
      const page = await browser.newPage();
      await page.setViewportSize(VIEWPORT);

      // ═══════════════════════════════════════════════════════════════
      // PHASE 1: Product Page → Checkout (Computer Use or saved replay)
      //   This is the domain-specific visual part: dismiss popups,
      //   select size/variant, add to cart, navigate to checkout form
      // ═══════════════════════════════════════════════════════════════
      logger.info(`[${checkoutId}] ──── PHASE 1: Add to Cart ────`);

      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);

      const savedFlow = await CheckoutFlow.findOne({ domain, status: 'active' }).catch(() => null);
      let addToCartSteps = savedFlow?.addToCartSteps || [];
      let usedSavedFlow = false;

      // Try replaying saved add-to-cart steps first
      if (addToCartSteps.length > 0 && savedFlow.successCount > 0) {
        logger.info(`[${checkoutId}] Replaying ${addToCartSteps.length} saved add-to-cart steps for ${domain}`);
        const replayResult = await this._replaySavedFlow(page, { steps: addToCartSteps }, context, checkoutId);

        if (await fastCheckout.isCheckoutPage(page)) {
          logger.info(`[${checkoutId}] ✅ Saved add-to-cart replay reached checkout page`);
          usedSavedFlow = true;
        } else {
          logger.warn(`[${checkoutId}] Saved replay didn't reach checkout. Falling back to Computer Use.`);
          await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await sleep(2000);
          addToCartSteps = []; // Will re-record
        }
      }

      // If no saved flow or it failed, use Computer Use for Phase 1
      if (!usedSavedFlow) {
        logger.info(`[${checkoutId}] Using Computer Use to add to cart on ${domain}`);
        const phase1Result = await this._computerUsePhase1(page, context, checkoutId);
        totalLlmCalls += phase1Result.llmCalls;
        addToCartSteps = phase1Result.recordedSteps;

        if (!phase1Result.reachedCheckout) {
          // Phase 1 might have completed the whole checkout (for simple sites)
          if (phase1Result.success) {
            const executionMs = Date.now() - startTime;
            await this._saveFlowPhased(domain, addToCartSteps, null, null).catch(() => {});
            return { ...phase1Result, executionMs, usedSavedFlow: false };
          }
          throw new Error(phase1Result.error || 'Failed to reach checkout page');
        }
      }

      // ═══════════════════════════════════════════════════════════════
      // PHASE 2: Fill Shipping & Payment (DOM fast-fill, zero LLM)
      //
      //   SCALABLE: Works on ANY website via 3-source selector merge:
      //     1. Saved selectors (from CheckoutFlow DB — learned from prior visits)
      //     2. Universal detection (autocomplete/name/label heuristics)
      //     3. Platform-specific (Shopify/WooCommerce hardcoded fallbacks)
      //
      //   On unknown platforms, universal detection alone fills 60-80%.
      //   After Phase 3 (LLM), we LEARN selectors → next visit fills 95%+.
      // ═══════════════════════════════════════════════════════════════
      logger.info(`[${checkoutId}] ──── PHASE 2: Fast Form Fill ────`);

      await sleep(2000); // Let checkout page fully load
      const { platform, confidence } = await fastCheckout.detectPlatform(page);
      logger.info(`[${checkoutId}] Detected platform: ${platform} (confidence: ${(confidence * 100).toFixed(0)}%)`);

      // Load saved selectors from prior visits (the "learning" part)
      const rawSelectors = savedFlow?.formSelectors;
      const savedFormSelectors = rawSelectors instanceof Map
        ? Object.fromEntries(rawSelectors)
        : (rawSelectors || {});
      const savedSelectorCount = Object.keys(savedFormSelectors).length;
      if (savedSelectorCount > 0) {
        logger.info(`[${checkoutId}] 📚 Loaded ${savedSelectorCount} saved selectors from prior visit`);
      }

      let formFillResult = { filledCount: 0, totalFields: 0, filledFields: [], missedFields: [] };
      let paymentFillResult = { filledCount: 0 };

      // Always try fast form fill — universal detection works even on unknown platforms
      formFillResult = await fastCheckout.fastFillForm(page, platform, context, checkoutId, savedFormSelectors);

      // Try to advance to payment section — only if ALL critical shipping fields were filled
      const criticalShippingFilled = formFillResult.filledCount >= 5 && formFillResult.missedFields.length <= 2;
      if (criticalShippingFilled) {
        await this._clickContinueButton(page, checkoutId);
        await sleep(3000);

        // Multi-step checkouts: click continue again (shipping method)
        await this._clickContinueButton(page, checkoutId);
        await sleep(2000);

        // Only attempt payment fast-fill if ALL shipping fields were filled (no collision risk)
        if (formFillResult.missedFields.length === 0) {
          const cardholderName = context.address?.fullName || context.user.name;
          paymentFillResult = await fastCheckout.fastFillPayment(page, platform, context.card, cardholderName, checkoutId, savedFormSelectors);

          if (paymentFillResult.filledCount > 0) {
            await this._clickContinueButton(page, checkoutId);
            await sleep(2000);
          }
        } else {
          logger.info(`[${checkoutId}] ⏭️ Skipping Phase 2 payment fill — ${formFillResult.missedFields.length} shipping fields missed, Phase 3 will handle`);
        }
      } else {
        logger.info(`[${checkoutId}] ⏭️ Shipping form incomplete (${formFillResult.filledCount} fields), Phase 3 will handle remaining`);
      }

      // ═══════════════════════════════════════════════════════════════
      // PHASE 3: Review & Complete (Computer Use for remaining work)
      //   Tell Claude EXACTLY which fields are done and which need help.
      //   This eliminates aimless scrolling.
      // ═══════════════════════════════════════════════════════════════
      logger.info(`[${checkoutId}] ──── PHASE 3: Review & Complete ────`);

      const fieldsFilledByDom = formFillResult.filledCount + paymentFillResult.filledCount;
      const shippingMissed = formFillResult.missedFields || [];
      const paymentMissed = paymentFillResult.filledCount < 4;

      // Build a precise prompt telling Claude exactly what's done and what's left
      let phase3Prompt;

      if (fieldsFilledByDom === 0) {
        // Nothing filled — full form fill needed
        phase3Prompt = `You are on the checkout page. Take a screenshot and fill all fields (shipping, payment), then ${context.dryRun ? 'navigate to the final submit button but DO NOT click it — say DRY_RUN_COMPLETE' : 'submit the order'}.`;
      } else {
        const filledList = (formFillResult.filledFields || []).join(', ');
        const missedList = shippingMissed.join(', ');

        phase3Prompt = `You are on the checkout page. Automation has ALREADY filled these shipping fields: [${filledList}]. ` +
          `Do NOT re-type or overwrite those fields.\n\n`;

        if (shippingMissed.length > 0) {
          phase3Prompt += `These shipping fields STILL NEED to be filled: [${missedList}]. Fill them now.\n`;
        }

        if (paymentMissed) {
          phase3Prompt += `Payment card details have ${paymentFillResult.filledCount > 0 ? 'been PARTIALLY entered' : 'NOT been entered yet'}. ` +
            `Fill any missing card fields (number, name, expiry, CVV).\n`;
        }

        phase3Prompt += `\nAfter all fields are filled, ${context.dryRun
          ? 'navigate to the FINAL submit/place-order page. DO NOT click submit. Say "DRY_RUN_COMPLETE" and describe what you see.'
          : 'click the submit/place order button.'}`;

        phase3Prompt += `\n\nIMPORTANT: Take a screenshot first to see the current state. ` +
          `If you see a "Continue" button, click it to advance to the next step. ` +
          `Don't scroll around looking for things — the form is sequential (shipping → shipping method → payment → review).`;
      }

      const phase3Result = await this._computerUseCheckout(page, context, checkoutId, phase3Prompt);
      totalLlmCalls += phase3Result.llmCalls;

      const executionMs = Date.now() - startTime;

      // ── LEARNING LOOP: Discover selectors from the filled form ────
      //   After Phase 3 (LLM fills remaining fields), scan the DOM to
      //   find which CSS selectors correspond to each field. Save these
      //   so the NEXT visit to this domain uses them directly (no LLM).
      let mergedSelectors = formFillResult.selectors || {};
      if (phase3Result.success) {
        try {
          const learnedSelectors = await fastCheckout.discoverSelectors(page);
          // Merge: learned selectors fill gaps, but don't overwrite known-good selectors
          mergedSelectors = { ...learnedSelectors, ...mergedSelectors };
          const newFields = Object.keys(learnedSelectors).filter((k) => !formFillResult.selectors?.[k]);
          if (newFields.length > 0) {
            logger.info(`[${checkoutId}] 📚 Learned ${newFields.length} new selectors: ${newFields.join(', ')}`);
          }
        } catch (e) {
          logger.warn(`[${checkoutId}] Selector discovery failed: ${e.message}`);
        }
      }

      await this._saveFlowPhased(domain, addToCartSteps, platform, mergedSelectors).catch(() => {});

      if (phase3Result.success) {
        logger.info(`[${checkoutId}] ✅ Hybrid checkout succeeded in ${executionMs}ms (${totalLlmCalls} LLM calls, DOM filled ${fieldsFilledByDom} fields)`);
        return { ...phase3Result, executionMs, llmCalls: totalLlmCalls, usedSavedFlow };
      }

      throw new Error(phase3Result.error || 'Checkout failed in review phase');
    } catch (error) {
      const executionMs = Date.now() - startTime;
      logger.error(`[${checkoutId}] ❌ Checkout failed on ${domain}: ${error.message}`, { executionMs });
      throw error;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * Click a "Continue" / "Continue to shipping" / "Continue to payment" button
   */
  async _clickContinueButton(page, checkoutId) {
    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Continue")',
      '#continue_button',
      '[data-step] button',
      'button:has-text("Continue to shipping")',
      'button:has-text("Continue to payment")',
    ];

    for (const sel of buttonSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn && await btn.isVisible().catch(() => false)) {
          await btn.click();
          logger.info(`[${checkoutId}] ⚡ Clicked continue button: ${sel}`);
          await page.waitForLoadState('domcontentloaded').catch(() => {});
          return true;
        }
      } catch { continue; }
    }

    logger.warn(`[${checkoutId}] No continue button found`);
    return false;
  }

  /**
   * Save phased flow data (add-to-cart steps + platform + selectors)
   */
  async _saveFlowPhased(domain, addToCartSteps, platform, selectors) {
    const existing = await CheckoutFlow.findOne({ domain });

    if (existing) {
      if (addToCartSteps?.length > 0) existing.addToCartSteps = addToCartSteps;
      if (platform && platform !== 'unknown') existing.platform = platform;
      // Merge new selectors with existing (don't lose previously learned selectors)
      if (selectors && Object.keys(selectors).length > 0) {
        const currentSelectors = existing.formSelectors instanceof Map
          ? Object.fromEntries(existing.formSelectors)
          : existing.formSelectors || {};
        const merged = { ...currentSelectors, ...selectors };
        existing.formSelectors = merged;
      }
      existing.successCount += 1;
      existing.lastSuccessAt = new Date();
      await existing.save();
      const selectorCount = selectors ? Object.keys(selectors).length : 0;
      logger.info(`Updated flow for ${domain} (platform: ${platform}, addToCart: ${addToCartSteps?.length || 0} steps, selectors: ${selectorCount})`);
    } else {
      await CheckoutFlow.create({
        domain,
        platform: platform || 'unknown',
        addToCartSteps: addToCartSteps || [],
        formSelectors: selectors || {},
        successCount: 1,
        lastSuccessAt: new Date(),
        status: 'active',
      });
      const selectorCount = selectors ? Object.keys(selectors).length : 0;
      logger.info(`Saved new flow for ${domain} (platform: ${platform}, addToCart: ${addToCartSteps?.length || 0} steps, selectors: ${selectorCount})`);
    }
  }

  isReady() {
    // Ready if either engine is available
    return !!this.anthropic || config.checkout.useBrowserUse;
  }

  /**
   * Check if the Browser Use Python agent is running
   * @returns {Promise<boolean>}
   */
  async _isBrowserUseAvailable() {
    if (!config.checkout.useBrowserUse) return false;
    try {
      return await browserUseClient.isReady();
    } catch {
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: COMPUTER USE — Add to Cart (stops at checkout form)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Uses Claude Computer Use ONLY to get from product page → checkout form.
   * Stops as soon as it detects a checkout page. Does NOT fill forms.
   * Typically 3-5 LLM turns instead of 15+.
   */
  async _computerUsePhase1(page, context, checkoutId) {
    const recordedSteps = [];
    let llmCalls = 0;
    let deadline = Date.now() + Math.min(this.timeoutMs, 180000); // Max 3 min for phase 1 (allows for rate limits)
    const maxPhase1Turns = Math.min(this.maxTurns, 20);

    const systemPrompt = this._buildPhase1Prompt(context);

    const messages = [
      {
        role: 'user',
        content: `You are on the product page for "${context.product.title}" at $${context.product.price}. ` +
          `Your goal: add this product to cart and navigate to the checkout form. ` +
          `Do NOT fill any shipping/payment forms — just get to the checkout page. ` +
          `Start by taking a screenshot to see the page.`,
      },
    ];

    for (let turn = 0; turn < maxPhase1Turns; turn++) {
      if (Date.now() > deadline) {
        return { reachedCheckout: false, success: false, error: 'Phase 1 timed out', recordedSteps, llmCalls };
      }

      this._trimConversation(messages);
      llmCalls++;

      let response;
      try {
        response = await this.anthropic.beta.messages.create({
          model: this.model,
          max_tokens: 1024,
          betas: [BETA_FLAG],
          system: systemPrompt,
          tools: [COMPUTER_TOOL],
          messages,
        });
      } catch (apiError) {
        if (apiError.status === 429) {
          const retryAfter = parseInt(apiError.headers?.['retry-after'] || '10', 10);
          logger.warn(`[${checkoutId}] Rate limited, waiting ${retryAfter}s...`);
          await sleep(retryAfter * 1000);
          // Don't count rate-limit waits against the deadline
          deadline = Math.max(deadline, Date.now() + 60000);
          turn--;
          llmCalls--;
          continue;
        }
        return { reachedCheckout: false, success: false, error: `API error: ${apiError.message}`, recordedSteps, llmCalls };
      }

      messages.push({ role: 'assistant', content: response.content });

      // Check for phase 1 completion signals
      let reachedCheckout = false;
      for (const block of response.content) {
        if (block.type === 'text') {
          logger.info(`[${checkoutId}] Phase1 turn ${turn + 1}: ${block.text.substring(0, 200)}`);
          // ONLY match the explicit signal word — NOT phrases like "navigate to the checkout form"
          if (block.text.includes('REACHED_CHECKOUT')) {
            reachedCheckout = true;
          }
          // If the LLM completed the whole thing somehow
          if (this._isCompletionSignal(block.text)) {
            return { reachedCheckout: false, success: true, retailerOrderId: this._extractOrderNumber(block.text), confirmationUrl: page.url(), recordedSteps, llmCalls };
          }
        }
      }

      // Also check DOM for checkout page arrival (only after actions, not on first turn)
      if (!reachedCheckout && turn > 0) {
        reachedCheckout = await fastCheckout.isCheckoutPage(page);
      }

      if (reachedCheckout) {
        logger.info(`[${checkoutId}] ✅ Phase 1 complete — reached checkout page in ${turn + 1} turns`);
        return { reachedCheckout: true, recordedSteps, llmCalls };
      }

      if (response.stop_reason === 'end_turn') {
        // Check if we're on checkout despite no signal
        if (await fastCheckout.isCheckoutPage(page)) {
          return { reachedCheckout: true, recordedSteps, llmCalls };
        }
        return { reachedCheckout: false, success: false, error: 'Agent stopped before reaching checkout', recordedSteps, llmCalls };
      }

      // Execute tool calls
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'computer') {
          const action = block.input;
          logger.info(`[${checkoutId}] Phase1 turn ${turn + 1}: ${action.action}${action.coordinate ? ` at (${action.coordinate})` : ''}${action.text ? ` "${action.text.substring(0, 50)}"` : ''}`);

          try {
            const result = await this._executeComputerAction(page, action);
            if (action.action !== 'screenshot') {
              recordedSteps.push({
                action: action.action,
                coordinate: action.coordinate,
                text: action.text,
                direction: action.direction,
                url: page.url(),
                timestamp: Date.now(),
              });
            }
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: [result] });
          } catch (execError) {
            logger.warn(`[${checkoutId}] Phase1 action failed: ${execError.message}`);
            const errorSS = await page.screenshot({ type: 'png' }).catch(() => null);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: errorSS
                ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: errorSS.toString('base64') } }]
                : [{ type: 'text', text: `Action failed: ${execError.message}` }],
              is_error: true,
            });
          }
        }
      }

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }
    }

    // Final check
    if (await fastCheckout.isCheckoutPage(page)) {
      return { reachedCheckout: true, recordedSteps, llmCalls };
    }
    return { reachedCheckout: false, success: false, error: `Phase 1 max turns (${maxPhase1Turns})`, recordedSteps, llmCalls };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: COMPUTER USE — Complete remaining checkout (review/submit)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * General Computer Use loop. Accepts an optional initialPrompt to tell
   * Claude where we are (e.g., "forms are already filled, just review").
   * This is used for Phase 3 and as a general fallback.
   */
  async _computerUseCheckout(page, context, checkoutId, initialPrompt = null) {
    const recordedSteps = [];
    let llmCalls = 0;
    const deadline = Date.now() + this.timeoutMs;

    const systemPrompt = this._buildSystemPrompt(context);

    const defaultPrompt = `You are on the product page for "${context.product.title}" at $${context.product.price}. ` +
      `Your goal: add this product to cart, proceed to checkout, fill shipping and payment, and complete the purchase. ` +
      `Start by taking a screenshot to see the page.`;

    const messages = [
      { role: 'user', content: initialPrompt || defaultPrompt },
    ];

    for (let turn = 0; turn < this.maxTurns; turn++) {
      if (Date.now() > deadline) {
        return { success: false, error: 'Checkout timed out', recordedSteps, llmCalls };
      }

      this._trimConversation(messages);
      llmCalls++;

      let response;
      try {
        response = await this.anthropic.beta.messages.create({
          model: this.model,
          max_tokens: 1024,
          betas: [BETA_FLAG],
          system: systemPrompt,
          tools: [COMPUTER_TOOL],
          messages,
        });
      } catch (apiError) {
        if (apiError.status === 429) {
          const retryAfter = parseInt(apiError.headers?.['retry-after'] || '5', 10);
          logger.warn(`[${checkoutId}] Rate limited, waiting ${retryAfter}s...`);
          await sleep(retryAfter * 1000);
          turn--;
          llmCalls--;
          continue;
        }
        logger.error(`[${checkoutId}] API call failed at turn ${turn + 1}: ${apiError.message}`);
        return { success: false, error: `API error: ${apiError.message}`, recordedSteps, llmCalls };
      }

      messages.push({ role: 'assistant', content: response.content });

      let isDone = false;
      let orderNumber = null;

      for (const block of response.content) {
        if (block.type === 'text') {
          logger.info(`[${checkoutId}] Turn ${turn + 1} text: ${block.text.substring(0, 200)}`);
          if (this._isCompletionSignal(block.text)) {
            isDone = true;
            orderNumber = this._extractOrderNumber(block.text);
          }
        }
      }

      if (isDone) {
        return { success: true, retailerOrderId: orderNumber, confirmationUrl: page.url(), recordedSteps, llmCalls };
      }

      if (response.stop_reason === 'end_turn') {
        const confirmation = await this._checkForConfirmation(page);
        if (confirmation.isConfirmation) {
          return { success: true, retailerOrderId: confirmation.orderNumber, confirmationUrl: page.url(), recordedSteps, llmCalls };
        }
        return { success: false, error: 'Agent stopped without completing checkout', recordedSteps, llmCalls };
      }

      // Execute tool calls
      const toolResults = [];
      for (const block of response.content) {
        if (block.type === 'tool_use' && block.name === 'computer') {
          const action = block.input;
          logger.info(`[${checkoutId}] Turn ${turn + 1}: ${action.action}${action.coordinate ? ` at (${action.coordinate})` : ''}${action.text ? ` "${action.text.substring(0, 50)}"` : ''}`);

          try {
            const result = await this._executeComputerAction(page, action);

            if (action.action !== 'screenshot') {
              recordedSteps.push({
                action: action.action,
                coordinate: action.coordinate,
                text: action.text,
                direction: action.direction,
                url: page.url(),
                timestamp: Date.now(),
              });
            }

            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: [result] });
          } catch (execError) {
            logger.warn(`[${checkoutId}] Action failed: ${execError.message}`);
            const errorScreenshot = await page.screenshot({ type: 'png' }).catch(() => null);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: errorScreenshot
                ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: errorScreenshot.toString('base64') } }]
                : [{ type: 'text', text: `Action failed: ${execError.message}` }],
              is_error: true,
            });
          }
        }
      }

      if (toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }
    }

    return { success: false, error: `Reached max turns (${this.maxTurns})`, recordedSteps, llmCalls };
  }

  // ═══════════════════════════════════════════════════════════════════
  // COMPUTER ACTION EXECUTION (Playwright)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Execute a Computer Use action and return a screenshot.
   *
   * Optimized: Uses JPEG at 60% quality + half resolution for ~3x smaller payloads.
   * This cuts upload time and API token cost significantly.
   */
  async _executeComputerAction(page, input) {
    const screenshot = async () => {
      const ss = await page.screenshot({ type: 'jpeg', quality: 60 });
      return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: ss.toString('base64') } };
    };

    switch (input.action) {
      case 'screenshot': {
        return screenshot();
      }

      case 'left_click': {
        const [x, y] = input.coordinate;
        await page.mouse.click(x, y);
        await sleep(600);
        await page.waitForLoadState('domcontentloaded').catch(() => {});
        return screenshot();
      }

      case 'right_click': {
        const [x, y] = input.coordinate;
        await page.mouse.click(x, y, { button: 'right' });
        await sleep(200);
        return screenshot();
      }

      case 'double_click': {
        const [x, y] = input.coordinate;
        await page.mouse.dblclick(x, y);
        await sleep(400);
        return screenshot();
      }

      case 'middle_click': {
        const [x, y] = input.coordinate;
        await page.mouse.click(x, y, { button: 'middle' });
        await sleep(200);
        return screenshot();
      }

      case 'type': {
        await page.keyboard.type(input.text, { delay: 8 });
        await sleep(100);
        return screenshot();
      }

      case 'key': {
        // Map Claude's key names to Playwright-compatible key names
        const keyMap = {
          'Page_Down': 'PageDown', 'Page_Up': 'PageUp',
          'page_down': 'PageDown', 'page_up': 'PageUp',
          'Caps_Lock': 'CapsLock', 'Num_Lock': 'NumLock',
          'Scroll_Lock': 'ScrollLock',
          'Left': 'ArrowLeft', 'Right': 'ArrowRight',
          'Up': 'ArrowUp', 'Down': 'ArrowDown',
        };

        const keys = input.text.split(/\s+/);
        for (const rawKey of keys) {
          if (rawKey.includes('+')) {
            const parts = rawKey.split('+');
            const modifier = parts[0].toLowerCase();
            const keyName = keyMap[parts[1]] || parts[1];
            const modMap = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta' };
            await page.keyboard.down(modMap[modifier] || modifier);
            await page.keyboard.press(keyName);
            await page.keyboard.up(modMap[modifier] || modifier);
          } else {
            const key = keyMap[rawKey] || rawKey;
            await page.keyboard.press(key);
          }
          await sleep(50);
        }
        // If Enter/Return was pressed, wait for possible navigation
        const pressedEnter = keys.some((k) => k.toLowerCase() === 'return' || k.toLowerCase() === 'enter');
        if (pressedEnter) {
          await sleep(300);
          await page.waitForLoadState('domcontentloaded').catch(() => {});
        } else {
          await sleep(150);
        }
        return screenshot();
      }

      case 'scroll': {
        const [x, y] = input.coordinate;
        const delta = input.direction === 'down' ? 500 : input.direction === 'up' ? -500 : 0;
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, delta);
        await sleep(400);
        return screenshot();
      }

      case 'mouse_move': {
        const [x, y] = input.coordinate;
        await page.mouse.move(x, y);
        return screenshot();
      }

      case 'left_click_drag': {
        const [sx, sy] = input.start_coordinate;
        const [ex, ey] = input.coordinate;
        await page.mouse.move(sx, sy);
        await page.mouse.down();
        await page.mouse.move(ex, ey);
        await page.mouse.up();
        await sleep(400);
        return screenshot();
      }

      case 'triple_click': {
        const [x, y] = input.coordinate;
        await page.mouse.click(x, y, { clickCount: 3 });
        await sleep(400);
        return screenshot();
      }

      case 'wait': {
        await sleep(1500);
        return screenshot();
      }

      default: {
        logger.warn(`Unsupported computer action: ${input.action}`);
        return screenshot();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SAVED FLOW REPLAY (no LLM needed)
  // ═══════════════════════════════════════════════════════════════════

  async _replaySavedFlow(page, flow, context, checkoutId) {
    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];

      try {
        const resolvedText = step.text ? this._resolveTemplate(step.text, context) : undefined;

        logger.info(`[${checkoutId}] Replay step ${i + 1}/${flow.steps.length}: ${step.action}${step.coordinate ? ` at (${step.coordinate})` : ''}`);

        // Execute action directly — NO screenshots, NO LLM
        await this._executeReplayAction(page, {
          action: step.action,
          coordinate: step.coordinate,
          text: resolvedText,
          direction: step.direction,
        });
      } catch (error) {
        return {
          success: false,
          failedStep: i,
          error: `Step ${i + 1} failed: ${error.message}`,
        };
      }
    }

    // Verify we reached confirmation
    const confirmation = await this._checkForConfirmation(page);
    if (confirmation.isConfirmation) {
      return {
        success: true,
        retailerOrderId: confirmation.orderNumber,
        confirmationUrl: page.url(),
      };
    }

    return { success: false, error: 'Replay completed but no confirmation page detected' };
  }

  /**
   * Fast action executor for replaying saved flows.
   * No screenshots (no LLM to show them to).
   * Smart waits: short for type/key, longer for clicks that trigger navigation.
   */
  async _executeReplayAction(page, input) {
    switch (input.action) {
      case 'left_click': {
        const [x, y] = input.coordinate;
        await page.mouse.click(x, y);
        // Check if this click triggers a navigation (page load)
        const navWait = page.waitForLoadState('domcontentloaded', { timeout: 3000 }).catch(() => {});
        await sleep(300); // Minimal settle time
        await navWait;
        return;
      }

      case 'type': {
        await page.keyboard.type(input.text, { delay: 10 }); // Fast typing
        await sleep(100);
        return;
      }

      case 'key': {
        const keys = input.text.split(/\s+/);
        for (const key of keys) {
          if (key.includes('+')) {
            const parts = key.split('+');
            const modifier = parts[0].toLowerCase();
            const modMap = { ctrl: 'Control', alt: 'Alt', shift: 'Shift', meta: 'Meta', cmd: 'Meta' };
            await page.keyboard.down(modMap[modifier] || modifier);
            await page.keyboard.press(parts[1]);
            await page.keyboard.up(modMap[modifier] || modifier);
          } else {
            await page.keyboard.press(key);
          }
          await sleep(50);
        }
        return;
      }

      case 'scroll': {
        const [x, y] = input.coordinate;
        const delta = input.direction === 'down' ? 500 : -500;
        await page.mouse.move(x, y);
        await page.mouse.wheel(0, delta);
        await sleep(300);
        return;
      }

      case 'double_click': {
        const [x, y] = input.coordinate;
        await page.mouse.dblclick(x, y);
        await sleep(300);
        return;
      }

      case 'triple_click': {
        const [x, y] = input.coordinate;
        await page.mouse.click(x, y, { clickCount: 3 });
        await sleep(200);
        return;
      }

      case 'right_click': {
        const [x, y] = input.coordinate;
        await page.mouse.click(x, y, { button: 'right' });
        await sleep(200);
        return;
      }

      case 'mouse_move': {
        const [x, y] = input.coordinate;
        await page.mouse.move(x, y);
        return;
      }

      case 'wait': {
        await sleep(1000);
        return;
      }

      default:
        logger.warn(`Unsupported replay action: ${input.action}`);
        return;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // FLOW PERSISTENCE
  // ═══════════════════════════════════════════════════════════════════

  async _saveFlow(domain, steps) {
    if (!steps || steps.length === 0) return;

    const existing = await CheckoutFlow.findOne({ domain });

    if (existing) {
      existing.steps = steps;
      existing.successCount += 1;
      existing.lastSuccessAt = new Date();
      await existing.save();
      logger.info(`Updated checkout flow for ${domain} (${steps.length} steps)`);
    } else {
      await CheckoutFlow.create({
        domain,
        steps,
        successCount: 1,
        lastSuccessAt: new Date(),
        status: 'active',
      });
      logger.info(`Saved new checkout flow for ${domain} (${steps.length} steps)`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // BROWSER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  async _launchBrowser() {
    const launchOptions = {
      headless: config.checkout.headless !== false, // Default to headless
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    };

    if (config.checkout.proxyUrl) {
      launchOptions.proxy = { server: config.checkout.proxyUrl };
    }

    return chromium.launch(launchOptions);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SYSTEM PROMPTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Phase 1 prompt — ONLY for adding to cart and reaching checkout.
   * Much shorter and focused. No shipping/payment details exposed.
   */
  _buildPhase1Prompt(context) {
    const sizes = context.user.profile?.sizes || {};
    const sizeLines = [];
    if (sizes.shoeSize) sizeLines.push(`- Shoe size: ${sizes.shoeSize}`);
    if (sizes.shirtSize) sizeLines.push(`- Shirt/top size: ${sizes.shirtSize}`);
    if (sizes.pantsSize) sizeLines.push(`- Pants size: ${sizes.pantsSize}`);
    if (sizes.dressSize) sizeLines.push(`- Dress size: ${sizes.dressSize}`);
    const gender = context.user.profile?.gender || '';

    const sizeSection = sizeLines.length > 0
      ? `## User Sizes\n${sizeLines.join('\n')}${gender ? `\n- Gender: ${gender}` : ''}`
      : `## User Sizes\nNo sizes on file. Pick reasonable defaults (M for clothing, 10 for US shoes).${gender ? ` Gender: ${gender}.` : ''}`;

    return `You are Swiftbuy's checkout agent. Your job is to add a product to cart and navigate to the checkout form.

## IMPORTANT: Your ONLY goal is to get to the checkout page.
- DO NOT fill any shipping, email, or payment forms
- DO NOT type into any form fields
- JUST: dismiss popups → select size/variant → add to cart → go to checkout
- When you see a checkout form (with email/name/address fields visible), say "REACHED_CHECKOUT"

## Product
- Title: ${context.product.title}
- Expected price: $${context.product.price}

${sizeSection}

## Rules
1. Dismiss cookie banners and popups FIRST
2. If size/variant selection is needed, use the sizes from "User Sizes" — do NOT guess
3. Click "Add to Cart" / "Add to Bag" or similar button
4. Navigate to checkout (click "Checkout" / "Proceed to Checkout" / the cart icon → checkout)
5. STOP as soon as you see a checkout form with shipping/email fields. Say "REACHED_CHECKOUT"
6. If you see "Continue as guest" or "Guest checkout", click that instead of "Sign in"
7. Work efficiently — don't take extra screenshots between steps
8. If the page has a quantity selector, leave it at 1`;
  }

  /**
   * Full system prompt — for Phase 3 (review & complete) or full fallback checkout
   */
  _buildSystemPrompt(context) {
    // Build size guidance from user profile
    const sizes = context.user.profile?.sizes || {};
    const sizeLines = [];
    if (sizes.shoeSize) sizeLines.push(`- Shoe size: ${sizes.shoeSize}`);
    if (sizes.shirtSize) sizeLines.push(`- Shirt/top size: ${sizes.shirtSize}`);
    if (sizes.pantsSize) sizeLines.push(`- Pants size: ${sizes.pantsSize}`);
    if (sizes.dressSize) sizeLines.push(`- Dress size: ${sizes.dressSize}`);
    const gender = context.user.profile?.gender || '';

    const sizeSection = sizeLines.length > 0
      ? `## User Sizes (use these EXACTLY)\n${sizeLines.join('\n')}${gender ? `\n- Gender: ${gender}` : ''}\n\nWhen the product page asks for a size, use the sizes above. For shoes, use the shoe size. For shirts/tops, use the shirt size. For pants, use the pants size. Do NOT guess — use these values.`
      : `## User Sizes\nNo sizes on file. If the product requires a size, pick a reasonable default (M for clothing, 10 for US shoes).${gender ? ` User gender: ${gender}.` : ''}`;

    // Resolve phone — try address, then profile, then flag it
    const phone = context.address?.phone || context.user.phone || '';
    const phoneNote = phone
      ? `- Phone: ${phone}`
      : `- Phone: (not provided — if the site requires a phone number, use a placeholder: 555-000-0000)`;

    // Dry-run mode instructions
    const dryRunSection = context.dryRun
      ? `\n## ⚠️  DRY-RUN MODE (CRITICAL)
This is a TEST RUN. You must follow these rules EXACTLY:
1. Go through the ENTIRE checkout process — add to cart, fill shipping, fill payment
2. Fill in ALL form fields including the card details provided
3. Navigate all the way to the FINAL page where the "Place Order" / "Submit" / "Pay Now" button is visible
4. **DO NOT CLICK** the final submit/place-order button
5. Instead, take a screenshot of the final page showing the order summary and the submit button
6. Then say "DRY_RUN_COMPLETE" followed by:
   - The order total shown on the page
   - What the submit button says (e.g. "Place Order", "Pay $XX.XX", etc.)
   - A summary of what's in the cart
7. This is a test card (4111...) — if the site does real-time card validation and rejects it, that's expected. Report "DRY_RUN_COMPLETE — card validation failed at payment step" and describe how far you got.\n`
      : '';

    return `You are Swiftbuy's checkout agent. Your job is to ${context.dryRun ? 'test the checkout flow on' : 'complete an online purchase using'} the browser.
${dryRunSection}
## Your Goal
Add the product to cart, fill shipping and payment info, ${context.dryRun ? 'and navigate to the final submit button (DO NOT click it).' : 'and submit the order.'}

## Product
- Title: ${context.product.title}
- Expected price: $${context.product.price}

${sizeSection}

## Shipping Address
- Full name: ${context.address?.fullName || context.user.name}
- Street: ${context.address?.street || ''}
- City: ${context.address?.city || ''}
- State: ${context.address?.state || ''}
- ZIP: ${context.address?.zipCode || ''}
- Country: ${(() => {
      const c = context.address?.country || 'US';
      const resolved = fastCheckout.resolveCountry?.(c);
      return resolved ? `${resolved.name} (${resolved.code})` : c;
    })()}
${phoneNote}
- Email: ${context.user.email}

## Payment Card${context.dryRun ? ' (TEST CARD — may be rejected by real-time validation)' : ''}
- Card number: ${context.card.number}
- Expiry month: ${context.card.expiryMonth}
- Expiry year: ${context.card.expiryYear}
- CVV: ${context.card.cvv}
- Cardholder name: ${context.address?.fullName || context.user.name}

## Rules
1. ALWAYS use guest checkout — NEVER create an account or log in
2. Dismiss cookie banners and popups first
3. If size/variant selection is needed, use the sizes from "User Sizes" above — do NOT guess
4. Before ${context.dryRun ? 'reaching' : 'submitting'} the final payment, verify the total is within ±20% of $${context.product.price} (to account for tax & shipping)
5. If the total is way too high or something looks wrong, STOP and explain
6. ${context.dryRun ? 'When you reach the final submit page, say "DRY_RUN_COMPLETE" and describe what you see' : 'When you see an order confirmation page, say "CHECKOUT_COMPLETE" followed by the order number if visible'}
7. Do NOT submit payment if the card is declined or there's an error — report it
8. Work efficiently — minimize unnecessary screenshots between actions
9. If a required field (like phone) is empty and the site won't proceed, use the placeholder noted above

## Efficiency Tips (important!)
- After typing in a form field, use Tab key to move to the next field instead of clicking it
- For dropdowns (like State), click to open it, then click the correct option in the list
- If a dropdown doesn't open by clicking, try using the keyboard: click the field, then type the first few letters
- You can chain: type value → press Tab → type next value → press Tab → etc.
- Don't take extra screenshots between fields when you can just Tab to the next one

## Important
- You have full control of the browser through the computer tool
- Take a screenshot first to see the page state
- Click, type, scroll as needed
- When typing into input fields, click the field first, then type
- For dropdowns/select elements, click to open, then click the option`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Trim conversation history to keep token usage manageable.
   * Removes screenshot images from older messages, keeping only
   * the initial user message + last 8 messages (4 turn pairs).
   * Replaced images become text descriptions so Claude maintains context.
   */
  _trimConversation(messages) {
    if (messages.length <= 9) return; // Nothing to trim

    // Keep first message (initial prompt) and last 8 messages
    const keepFromEnd = 8;
    const trimEnd = messages.length - keepFromEnd;

    for (let i = 1; i < trimEnd; i++) {
      const msg = messages[i];
      if (!msg.content || !Array.isArray(msg.content)) continue;

      // Replace image content blocks with text placeholders
      msg.content = msg.content.map((block) => {
        if (block.type === 'image') {
          return { type: 'text', text: '[previous screenshot — trimmed for context length]' };
        }
        // Handle tool_result content that contains images
        if (block.type === 'tool_result' && Array.isArray(block.content)) {
          block.content = block.content.map((inner) => {
            if (inner.type === 'image') {
              return { type: 'text', text: '[previous screenshot — trimmed]' };
            }
            return inner;
          });
        }
        return block;
      });
    }
  }

  _isCompletionSignal(text) {
    const lower = text.toLowerCase();
    return (
      lower.includes('checkout_complete') ||
      lower.includes('dry_run_complete') ||
      lower.includes('ready_to_submit') ||
      lower.includes('order confirmed') ||
      lower.includes('order has been placed') ||
      lower.includes('purchase complete') ||
      lower.includes('order successful')
    );
  }

  _extractOrderNumber(text) {
    const match = text.match(/(?:order|confirmation)\s*(?:#|number|:)\s*([A-Z0-9-]+)/i);
    return match ? match[1] : null;
  }

  async _checkForConfirmation(page) {
    try {
      const pageText = await page.evaluate(() => document.body.innerText.substring(0, 3000));
      const url = page.url().toLowerCase();

      const confirmationKeywords = [
        'order confirmed', 'order placed', 'thank you for your order',
        'order number', 'confirmation number', 'order #',
        'your order has been placed', 'purchase complete',
        'order successful', 'thanks for your purchase',
      ];

      const isConfirmation =
        confirmationKeywords.some((kw) => pageText.toLowerCase().includes(kw)) ||
        url.includes('confirm') ||
        url.includes('thank');

      let orderNumber = null;
      const orderMatch = pageText.match(/(?:order|confirmation)\s*(?:#|number|:)\s*([A-Z0-9-]+)/i);
      if (orderMatch) orderNumber = orderMatch[1];

      return { isConfirmation, orderNumber };
    } catch {
      return { isConfirmation: false, orderNumber: null };
    }
  }

  /**
   * Replace template variables in saved flow text fields
   * Templates: {{card.number}}, {{address.city}}, {{user.email}}, etc.
   */
  _resolveTemplate(text, context) {
    if (!text || typeof text !== 'string') return text;

    return text
      .replace(/\{\{card\.number\}\}/g, context.card.number || '')
      .replace(/\{\{card\.cvv\}\}/g, context.card.cvv || '')
      .replace(/\{\{card\.expiry\}\}/g, context.card.expiry || '')
      .replace(/\{\{card\.expiryMonth\}\}/g, context.card.expiryMonth || '')
      .replace(/\{\{card\.expiryYear\}\}/g, context.card.expiryYear || '')
      .replace(/\{\{address\.fullName\}\}/g, context.address?.fullName || context.user.name || '')
      .replace(/\{\{address\.street\}\}/g, context.address?.street || '')
      .replace(/\{\{address\.city\}\}/g, context.address?.city || '')
      .replace(/\{\{address\.state\}\}/g, context.address?.state || '')
      .replace(/\{\{address\.zipCode\}\}/g, context.address?.zipCode || '')
      .replace(/\{\{address\.country\}\}/g, context.address?.country || 'US')
      .replace(/\{\{address\.phone\}\}/g, context.address?.phone || '')
      .replace(/\{\{user\.email\}\}/g, context.user.email || '')
      .replace(/\{\{user\.name\}\}/g, context.user.name || '');
  }
}

module.exports = new CheckoutAutomation();
