const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },

    // Transaction type
    type: {
      type: String,
      enum: ['purchase', 'refund', 'deposit', 'withdrawal'],
      required: true,
    },

    // Amounts
    usdcAmount: { type: Number, required: true },  // Amount in USDC
    fiatAmount: { type: Number, required: true },   // Amount in fiat after off-ramp
    fiatCurrency: { type: String, default: 'USD' },
    offRampFee: { type: Number, default: 0 },       // Fee charged for off-ramping
    exchangeRate: { type: Number },                  // USDC to fiat rate at time of tx

    // Wallet details
    walletAddress: { type: String, required: true },
    walletTransactionId: { type: String },           // ID from friend's wallet API

    // Status
    status: {
      type: String,
      enum: [
        'pending',          // Created, not yet sent to wallet
        'off_ramping',      // USDC being converted to fiat
        'off_ramp_complete', // Fiat ready for use
        'completed',        // Full transaction complete
        'failed',           // Transaction failed
        'refund_pending',   // Refund requested
        'refunded',         // Refund processed
      ],
      default: 'pending',
    },

    // Timestamps for each stage
    offRampStartedAt: { type: Date },
    offRampCompletedAt: { type: Date },
    completedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String },

    // Metadata
    metadata: {
      retailer: { type: String },
      productTitle: { type: String },
      agentId: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ walletTransactionId: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);



