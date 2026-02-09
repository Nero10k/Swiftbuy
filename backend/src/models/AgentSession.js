const mongoose = require('mongoose');

const agentSessionSchema = new mongoose.Schema(
  {
    agentId: {
      type: String,
      required: true,
      unique: true,
    },
    agentName: {
      type: String,
      required: true,
    },

    // API key (hashed)
    apiKeyHash: {
      type: String,
      required: true,
    },

    // Permissions
    permissions: {
      type: [String],
      default: ['search', 'purchase', 'wallet_read'],
      enum: ['search', 'purchase', 'wallet_read', 'wallet_write', 'order_manage'],
    },

    // Connected users
    authorizedUsers: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        authorizedAt: { type: Date, default: Date.now },
      },
    ],

    // Usage stats
    stats: {
      totalSearches: { type: Number, default: 0 },
      totalPurchases: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      lastActiveAt: { type: Date },
    },

    // Rate limiting
    rateLimit: {
      searchesPerMinute: { type: Number, default: 10 },
      purchasesPerHour: { type: Number, default: 20 },
    },

    // Status
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AgentSession', agentSessionSchema);


