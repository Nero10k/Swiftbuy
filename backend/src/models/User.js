const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const shippingAddressSchema = new mongoose.Schema({
  label: { type: String, default: 'Home' },
  fullName: { type: String, required: true },
  street: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, default: 'US' },
  phone: { type: String },
  isDefault: { type: Boolean, default: false },
});

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Karma Wallet
    karma: {
      accountId: { type: String },
      skLive: { type: String },       // Owner key (encrypted at rest ideally)
      skAgent: { type: String },      // Agent/spend key
      cardId: { type: String },
      cardLast4: { type: String },
      depositAddress: { type: String },
      kycStatus: {
        type: String,
        default: 'none',
      },
      kycUrl: { type: String },
      cardFrozen: { type: Boolean, default: false },
      perTxnLimit: { type: Number, default: 500 },
      dailyLimit: { type: Number, default: 1000 },
      monthlyLimit: { type: Number, default: 5000 },
    },

    // Legacy wallet address (kept for backwards compat)
    walletAddress: {
      type: String,
      unique: true,
      sparse: true,
    },

    // Personal profile (communicated to agents)
    profile: {
      phone: { type: String },
      // Clothing sizes
      sizes: {
        shirtSize: { type: String, enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', ''] },
        pantsSize: { type: String },       // e.g., "32x30", "M", "10"
        shoeSize: { type: String },        // e.g., "10", "42 EU"
        dressSize: { type: String },       // e.g., "8", "M"
      },
      // General info for better agent recommendations
      gender: { type: String, enum: ['male', 'female', 'non-binary', 'prefer-not-to-say', ''] },
      dietaryPreferences: [String],        // e.g., ["vegan", "gluten-free"]
      allergies: [String],                 // e.g., ["latex", "nuts"]
      notes: { type: String, maxlength: 500 }, // Free-form notes for agents
    },

    // Shopping preferences (learned over time)
    preferences: {
      favoriteCategories: [String],
      preferredBrands: [String],
      maxAutoApprove: { type: Number, default: 25 },
      spendingLimit: {
        daily: { type: Number, default: 500 },
        monthly: { type: Number, default: 5000 },
      },
      requireApproval: { type: Boolean, default: true },
    },

    // Shipping addresses
    shippingAddresses: [shippingAddressSchema],

    // Onboarding
    onboardingComplete: { type: Boolean, default: false },

    // Account status
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },

    // Connected agents
    connectedAgents: [
      {
        agentId: String,
        agentName: String,
        permissions: [String],
        connectedAt: { type: Date, default: Date.now },
      },
    ],

    // Stats (updated by intelligence service)
    stats: {
      totalOrders: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

module.exports = mongoose.model('User', userSchema);

