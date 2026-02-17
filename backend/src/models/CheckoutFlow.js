const mongoose = require('mongoose');

/**
 * CheckoutFlow — Learned checkout flows per domain
 *
 * THREE layers of intelligence (works on ANY website):
 *
 * 1. ADD-TO-CART STEPS — Computer Use recorded steps to get from product page → checkout
 *    Domain-specific, visually-driven steps (dismiss popups, select size, add-to-cart).
 *    Replayed on repeat visits — zero LLM cost.
 *
 * 2. FORM SELECTORS — CSS selectors for each form field, LEARNED from prior visits
 *    Discovered by universal detection + post-LLM scanning. On second visit, these
 *    fill the form instantly without any LLM interaction.
 *
 * 3. PLATFORM FINGERPRINT — Detected checkout platform (shopify, woocommerce, etc.)
 *    Enables platform-specific optimizations (iframe payment, React events).
 *    NOT required — unknown platforms use universal detection.
 *
 * Learning loop:
 *   Visit 1: Universal detects ~60-80% → LLM fills rest → LEARN selectors → save
 *   Visit 2: Saved selectors fill ~95%+ → LLM only reviews → IMPROVE selectors
 *   Visit N: Near-instant form fill, LLM cost → $0 for shipping/payment
 *
 *   ┌──────────────────────┬──────────────────────┬──────────────────────┐
 *   │ Phase                │ First visit          │ Repeat visit         │
 *   ├──────────────────────┼──────────────────────┼──────────────────────┤
 *   │ Add to cart          │ Computer Use (~5 LLM)│ Replay (0 LLM)      │
 *   │ Fill shipping/payment│ Universal + LLM      │ Saved selectors (0)  │
 *   │ Review + submit      │ Computer Use (~3 LLM)│ Computer Use (~2)    │
 *   └──────────────────────┴──────────────────────┴──────────────────────┘
 */
const checkoutFlowSchema = new mongoose.Schema(
  {
    // The domain this flow applies to (e.g. "nike.com", "allbirds.com")
    domain: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Detected checkout platform (enables fast DOM filling)
    platform: {
      type: String,
      enum: ['shopify', 'woocommerce', 'magento', 'bigcommerce', 'custom', 'unknown'],
      default: 'unknown',
    },

    // Phase 1: Add-to-cart steps (Computer Use recorded)
    // These are the steps to go from product page → checkout form
    addToCartSteps: [
      {
        action: { type: String, required: true },
        coordinate: [{ type: Number }],
        text: { type: String },
        direction: { type: String },
        url: { type: String },
        timestamp: { type: Date },
        // Phase tag for understanding what this step does
        phase: {
          type: String,
          enum: ['dismiss_popup', 'select_variant', 'add_to_cart', 'navigate_checkout', 'other'],
          default: 'other',
        },
      },
    ],

    // CSS selectors LEARNED for form fields — discovered by universal detection
    // + post-LLM scanning. Uses Map for flexibility — any fieldType→selector pair.
    // Common keys: email, firstName, lastName, address, city, state, zipCode,
    //              country, phone, cardNumber, cardExpiry, cardCvv, cardName
    formSelectors: {
      type: Map,
      of: String,
      default: {},
    },

    // Legacy: full step sequence (backwards compat)
    steps: [
      {
        action: { type: String, required: true },
        coordinate: [{ type: Number }],
        text: { type: String },
        direction: { type: String },
        url: { type: String },
        timestamp: { type: Date },
      },
    ],

    // Flow status
    status: {
      type: String,
      enum: ['active', 'needs_review', 'disabled'],
      default: 'active',
    },

    // Stats
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    lastSuccessAt: { type: Date },
    lastFailAt: { type: Date },
    lastFailReason: { type: String },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('CheckoutFlow', checkoutFlowSchema);
