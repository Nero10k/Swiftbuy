const mongoose = require('mongoose');

const searchSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    query: {
      type: String,
      required: true,
    },
    products: [
      {
        title: String,
        price: Number,
        currency: String,
        currencySymbol: String,
        retailer: String,
        url: String,
        imageUrl: String,
        image: String,
        rating: Number,
        reviewCount: Number,
        description: String,
        brand: String,
        category: String,
        source: String,
        externalId: String,
        shippingCost: Number,
        features: [String],
      },
    ],
    geo: {
      country: String,
      countryName: String,
      currency: String,
      currencySymbol: String,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SearchSession', searchSessionSchema);



