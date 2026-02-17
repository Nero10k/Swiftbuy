const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Conversation grouping
    conversationId: {
      type: String,
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    // Structured data attached to assistant messages
    metadata: {
      // Type of response
      type: {
        type: String,
        enum: [
          'text',           // Plain text
          'suggestions',    // Product/service suggestions
          'search_results', // Results from search
          'action',         // Taking an action (purchase, book)
          'preference_ask', // Asking for preference info
          'confirmation',   // Confirming an action
        ],
        default: 'text',
      },

      // Suggestions attached to the message
      suggestions: [
        {
          id: String,
          label: String,
          description: String,
          icon: String,      // emoji or icon name
          action: String,    // what happens when clicked
        },
      ],

      // If referencing products / results
      products: [
        {
          title: String,
          price: Number,
          retailer: String,
          url: String,
          image: String,
        },
      ],

      // Context about what was asked
      intent: String,
      category: String,
    },
  },
  {
    timestamps: true,
  }
);

// Get recent messages for context
chatMessageSchema.statics.getConversation = function (conversationId, limit = 50) {
  return this.find({ conversationId })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
};

// Get user's conversations list
chatMessageSchema.statics.getUserConversations = function (userId) {
  return this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: '$conversationId',
        lastMessage: { $first: '$content' },
        lastRole: { $first: '$role' },
        lastAt: { $first: '$createdAt' },
        messageCount: { $sum: 1 },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: 50 },
  ]);
};

module.exports = mongoose.model('ChatMessage', chatMessageSchema);



