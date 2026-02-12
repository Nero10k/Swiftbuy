const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },

    // Who
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    agentId: { type: String, required: true },

    // What
    product: {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      externalId: { type: String },
      title: { type: String, required: true },
      price: { type: Number, required: true },
      retailer: { type: String, required: true },
      url: { type: String },
      image: { type: String },
      category: { type: String, default: '' },
    },

    // Where
    shippingAddress: {
      fullName: String,
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String,
      phone: String,
    },

    // Payment
    payment: {
      method: { type: String, default: 'wallet' },
      walletTransactionId: { type: String },
      amount: { type: Number, required: true },
      currency: { type: String, default: 'USD' },
      usdcAmount: { type: Number }, // USDC equivalent before off-ramp
      offRampFee: { type: Number, default: 0 },
    },

    // Status
    status: {
      type: String,
      enum: [
        'pending_approval',    // Waiting for user to approve
        'approved',            // User approved, ready to execute
        'processing',          // Off-ramping USDC + purchasing
        'purchasing',          // Executing checkout on retailer
        'confirmed',           // Purchase confirmed by retailer
        'shipped',             // Item shipped
        'delivered',           // Item delivered
        'cancelled',           // Cancelled by user
        'failed',              // Purchase failed
        'refunded',            // Refund processed
      ],
      default: 'pending_approval',
    },

    // Approval
    approval: {
      required: { type: Boolean, default: true },
      autoApproved: { type: Boolean, default: false },
      approvedAt: { type: Date },
      approvedBy: { type: String }, // 'user' or 'auto'
      rejectedAt: { type: Date },
      rejectionReason: { type: String },
    },

    // Tracking
    tracking: {
      retailerOrderId: { type: String },
      trackingNumber: { type: String },
      carrier: { type: String },
      estimatedDelivery: { type: Date },
      trackingUrl: { type: String },
    },

    // Metadata
    metadata: {
      searchQuery: { type: String },
      agentConversationId: { type: String },
      executionTimeMs: { type: Number },
      retryCount: { type: Number, default: 0 },
      source: { type: String },
      failureReason: { type: String },
    },

    // Status history
    statusHistory: [
      {
        status: String,
        timestamp: { type: Date, default: Date.now },
        note: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ 'payment.walletTransactionId': 1 });

// Add status to history on change
orderSchema.pre('save', function (next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      timestamp: new Date(),
    });
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);


