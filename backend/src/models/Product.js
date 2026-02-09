const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    // External IDs
    externalId: { type: String, required: true },
    retailer: {
      type: String,
      required: true,
      enum: ['amazon', 'walmart', 'target', 'bestbuy', 'ebay'],
    },

    // Product info
    title: { type: String, required: true },
    description: { type: String },
    brand: { type: String },
    category: { type: String },
    images: [String],
    url: { type: String, required: true },

    // Pricing
    price: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    originalPrice: { type: Number },
    discount: { type: Number },

    // Ratings
    rating: { type: Number, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },

    // Availability
    inStock: { type: Boolean, default: true },
    stockCount: { type: Number },
    shippingInfo: {
      freeShipping: { type: Boolean, default: false },
      estimatedDays: { type: Number },
      cost: { type: Number, default: 0 },
    },

    // Metadata
    scrapedAt: { type: Date, default: Date.now },
    searchQuery: { type: String },

    // Price history (for intelligence)
    priceHistory: [
      {
        price: Number,
        date: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for deduplication
productSchema.index({ externalId: 1, retailer: 1 }, { unique: true });

// Text index for search
productSchema.index({ title: 'text', description: 'text', brand: 'text' });

// TTL index — products expire after 24 hours (re-scraped on demand)
productSchema.index({ scrapedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Product', productSchema);


