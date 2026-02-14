const mongoose = require('mongoose');

/**
 * CheckoutFlow — Learned checkout flows per domain
 *
 * Every time the AI checkout agent successfully completes a purchase
 * on a new domain, it records the exact sequence of actions. On repeat
 * visits, the replayer executes the saved flow directly — no LLM calls
 * needed, making it fast and free.
 *
 * If a saved step fails (site changed), the agent falls back to LLM
 * for that step only, then updates the stored flow.
 */
const checkoutFlowSchema = new mongoose.Schema(
  {
    // The domain this flow applies to (e.g. "nike.com", "target.com")
    domain: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // The recorded sequence of actions
    steps: [
      {
        // Step number in the sequence
        index: { type: Number, required: true },

        // What page/phase this step belongs to
        phase: {
          type: String,
          enum: ['product', 'cart', 'checkout', 'shipping', 'payment', 'review', 'confirmation', 'other'],
          default: 'other',
        },

        // The action to perform
        action: {
          type: {
            type: String,
            enum: ['click', 'fill', 'select', 'wait', 'navigate', 'scroll', 'press_key'],
            required: true,
          },

          // CSS selector or text content to find the element
          selector: { type: String },

          // For text-based selectors when CSS is fragile
          textContent: { type: String },

          // Value to fill (for 'fill' and 'select' actions)
          // Uses template variables like {card.number}, {address.street}, {user.email}
          value: { type: String },

          // Key to press (for 'press_key')
          key: { type: String },

          // URL to navigate to (for 'navigate')
          url: { type: String },

          // How long to wait in ms (for 'wait')
          waitMs: { type: Number },

          // Wait for a selector to appear before executing
          waitForSelector: { type: String },
        },

        // Optional: expected page URL pattern after this step
        expectedUrlPattern: { type: String },

        // How reliable this step has been (0-1)
        reliability: { type: Number, default: 1.0 },

        // Number of times this step has succeeded / failed
        successCount: { type: Number, default: 0 },
        failCount: { type: Number, default: 0 },
      },
    ],

    // Flow-level metadata
    successCount: { type: Number, default: 0 },
    failCount: { type: Number, default: 0 },
    lastSuccessAt: { type: Date },
    lastFailAt: { type: Date },
    lastFailReason: { type: String },

    // Average execution time in ms
    avgExecutionMs: { type: Number, default: 0 },

    // Hints for the AI agent when LLM fallback is needed
    hints: [{ type: String }],

    // Whether this flow requires special handling
    flags: {
      requiresLogin: { type: Boolean, default: false },
      requiresCaptcha: { type: Boolean, default: false },
      requiresProxy: { type: Boolean, default: false },
      isShopify: { type: Boolean, default: false },
      guestCheckoutAvailable: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
  }
);

// Update reliability scores
checkoutFlowSchema.methods.recordSuccess = function (executionMs) {
  this.successCount += 1;
  this.lastSuccessAt = new Date();
  // Rolling average
  this.avgExecutionMs = this.avgExecutionMs
    ? (this.avgExecutionMs * (this.successCount - 1) + executionMs) / this.successCount
    : executionMs;
  return this.save();
};

checkoutFlowSchema.methods.recordFailure = function (reason, failedStepIndex) {
  this.failCount += 1;
  this.lastFailAt = new Date();
  this.lastFailReason = reason;

  // Decrease reliability of the failed step
  if (failedStepIndex !== undefined && this.steps[failedStepIndex]) {
    this.steps[failedStepIndex].failCount += 1;
    const step = this.steps[failedStepIndex];
    step.reliability = step.successCount / (step.successCount + step.failCount);
  }

  return this.save();
};

module.exports = mongoose.model('CheckoutFlow', checkoutFlowSchema);

