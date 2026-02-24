const User = require('../../models/User');
const Order = require('../../models/Order');
const ChatMessage = require('../../models/ChatMessage');
const logger = require('../../utils/logger');

/**
 * Chat Service — context-aware conversational assistant
 *
 * Generates intelligent responses based on user profile,
 * order history, preferences, and current conversation context.
 */
class ChatService {
  /**
   * Process a user message and generate a response
   */
  async processMessage(userId, conversationId, userMessage) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Save user message
    await ChatMessage.create({
      userId,
      conversationId,
      role: 'user',
      content: userMessage,
    });

    // Get conversation history for context
    const history = await ChatMessage.getConversation(conversationId, 20);

    // Gather user context
    const context = await this._buildUserContext(user);

    // Detect intent
    const intent = this._detectIntent(userMessage, history);

    // Generate response based on intent
    const response = await this._generateResponse(intent, userMessage, context, history);

    // Save assistant response
    const saved = await ChatMessage.create({
      userId,
      conversationId,
      role: 'assistant',
      content: response.content,
      metadata: response.metadata,
    });

    return {
      id: saved._id,
      role: 'assistant',
      content: response.content,
      metadata: response.metadata,
      createdAt: saved.createdAt,
    };
  }

  /**
   * Generate the welcome message for a new conversation
   */
  async getWelcomeMessage(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const context = await this._buildUserContext(user);
    const suggestions = this._generateWelcomeSuggestions(context);
    const greeting = this._generateGreeting(context);

    return {
      role: 'assistant',
      content: greeting,
      metadata: {
        type: 'suggestions',
        suggestions,
      },
    };
  }

  /**
   * Build context about the user for intelligent responses
   */
  async _buildUserContext(user) {
    // Get recent orders
    const recentOrders = await Order.find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Identify missing profile fields
    const missingProfile = [];
    if (!user.shippingAddresses?.length) missingProfile.push('shipping_address');
    if (!user.profile?.sizes?.shirtSize && !user.profile?.sizes?.shoeSize) missingProfile.push('sizes');
    if (!user.profile?.gender) missingProfile.push('gender');
    if (!user.walletAddress) missingProfile.push('wallet');
    if (!user.preferences?.favoriteCategories?.length) missingProfile.push('favorite_categories');
    if (!user.preferences?.preferredBrands?.length) missingProfile.push('preferred_brands');

    return {
      name: user.name,
      hasWallet: !!user.walletAddress,
      hasAddress: user.shippingAddresses?.length > 0,
      profile: user.profile || {},
      preferences: user.preferences || {},
      stats: user.stats || {},
      recentOrders,
      missingProfile,
      connectedAgents: user.connectedAgents?.length || 0,
      onboardingComplete: user.onboardingComplete,
    };
  }

  /**
   * Detect the user's intent from their message
   */
  _detectIntent(message, history) {
    const lower = message.toLowerCase().trim();

    // Greeting
    if (/^(hi|hello|hey|sup|yo|what'?s up|good morning|good evening|good afternoon)\b/i.test(lower)) {
      return 'greeting';
    }

    // Search / shopping intent
    if (/\b(find|search|look for|looking for|show me|get me|buy|order|purchase|shop|need|want)\b/.test(lower)) {
      // Sub-intents
      if (/\b(flight|flights|fly|flying|plane|airline|airfare)\b/.test(lower)) return 'search_flights';
      if (/\b(hotel|hotels|stay|accommodation|room|airbnb|hostel|resort)\b/.test(lower)) return 'search_hotels';
      if (/\b(food|restaurant|dinner|lunch|breakfast|eat|meal|delivery|takeout|pizza|sushi)\b/.test(lower)) return 'search_food';
      if (/\b(ticket|tickets|concert|show|event|game|match|theater|theatre|movie)\b/.test(lower)) return 'search_events';
      if (/\b(car|rental|rent a|vehicle)\b/.test(lower)) return 'search_cars';
      return 'search_products';
    }

    // Price / deal questions
    if (/\b(price|cost|how much|cheapest|deal|discount|sale|compare|cheaper)\b/.test(lower)) {
      return 'price_inquiry';
    }

    // Help with profile / preferences
    if (/\b(size|sizes|preferences?|allerg|diet|address|shipping|profile|settings|wallet)\b/.test(lower)) {
      return 'profile_help';
    }

    // Order status
    if (/\b(order|tracking|status|where is|delivery|shipped|arrive|arriving)\b/.test(lower)) {
      return 'order_status';
    }

    // Recommendations
    if (/\b(recommend|suggest|idea|what should|help me (find|choose|decide|pick)|trending|popular|best)\b/.test(lower)) {
      return 'recommendations';
    }

    // Agent-related
    if (/\b(agent|bot|connect|api|token|integrate)\b/.test(lower)) {
      return 'agent_help';
    }

    // Wallet / spending
    if (/\b(wallet|balance|usdc|spend|budget|spending|limit)\b/.test(lower)) {
      return 'wallet_inquiry';
    }

    // Catch-all — treat as general conversation
    return 'general';
  }

  /**
   * Generate response based on intent + context
   */
  async _generateResponse(intent, message, context, history) {
    const handlers = {
      greeting: () => this._handleGreeting(context),
      search_products: () => this._handleSearchProducts(message, context),
      search_flights: () => this._handleSearchFlights(message, context),
      search_hotels: () => this._handleSearchHotels(message, context),
      search_food: () => this._handleSearchFood(message, context),
      search_events: () => this._handleSearchEvents(message, context),
      search_cars: () => this._handleSearchCars(message, context),
      price_inquiry: () => this._handlePriceInquiry(message, context),
      profile_help: () => this._handleProfileHelp(message, context),
      order_status: () => this._handleOrderStatus(context),
      recommendations: () => this._handleRecommendations(context),
      agent_help: () => this._handleAgentHelp(context),
      wallet_inquiry: () => this._handleWalletInquiry(context),
      general: () => this._handleGeneral(message, context),
    };

    const handler = handlers[intent] || handlers.general;
    return handler();
  }

  // ─── Intent handlers ───────────────────────────────────

  _handleGreeting(ctx) {
    const timeOfDay = new Date().getHours();
    const greeting = timeOfDay < 12 ? 'Good morning' : timeOfDay < 18 ? 'Good afternoon' : 'Good evening';

    let content = `${greeting}, ${ctx.name}! How can I help you today?`;

    // If there are missing profile items, nudge the user
    if (ctx.missingProfile.length > 0) {
      const nudges = {
        wallet: "I noticed you haven't connected your USDC wallet yet — would you like to set that up?",
        sizes: "By the way, if you share your clothing sizes, I can help your agent find the perfect fit every time.",
        favorite_categories: "What kind of things do you usually shop for? I can personalize my suggestions.",
      };
      const nudge = ctx.missingProfile.find((k) => nudges[k]);
      if (nudge) {
        content += `\n\n💡 ${nudges[nudge]}`;
      }
    }

    const suggestions = this._getQuickActions(ctx);

    return {
      content,
      metadata: { type: 'suggestions', suggestions, intent: 'greeting' },
    };
  }

  _handleSearchProducts(message, ctx) {
    let content = `I'd love to help you find that! Let me search across retailers for you.\n\n🔍 **Searching:** "${message.replace(/^(find|search|look for|looking for|show me|get me|buy|order|purchase|shop|need|want)\s*/i, '').trim()}"`;

    if (ctx.profile?.sizes?.shirtSize || ctx.profile?.sizes?.shoeSize) {
      content += `\n\n📏 I'll use your saved sizes (${[
        ctx.profile.sizes.shirtSize && `Shirt: ${ctx.profile.sizes.shirtSize}`,
        ctx.profile.sizes.shoeSize && `Shoe: ${ctx.profile.sizes.shoeSize}`,
      ].filter(Boolean).join(', ')}) to filter results.`;
    }

    if (!ctx.hasAddress) {
      content += `\n\n⚠️ You don't have a shipping address set up yet. Go to **Settings** to add one before purchasing.`;
    }

    const suggestions = [
      { id: 'filter_price', label: 'Set a budget', description: 'Narrow by price range', icon: '💰', action: 'filter_price' },
      { id: 'filter_brand', label: 'Specific brand?', description: 'Search a particular brand', icon: '🏷️', action: 'filter_brand' },
      { id: 'compare', label: 'Compare options', description: 'Side-by-side comparison', icon: '⚖️', action: 'compare' },
    ];

    return {
      content,
      metadata: { type: 'search_results', suggestions, intent: 'search_products', category: 'products' },
    };
  }

  _handleSearchFlights(message, ctx) {
    let content = `✈️ Let me search for flights for you!\n\nTo find the best options, I need a few details:`;

    const questions = [];
    if (!/from\s+\w+/i.test(message)) questions.push('**Departure city** — Where are you flying from?');
    if (!/to\s+\w+/i.test(message) && !/\bto\b/.test(message)) questions.push('**Destination** — Where do you want to go?');
    if (!/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{1,2}\/\d{1,2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|next month)\b/i.test(message)) {
      questions.push('**Dates** — When do you want to fly? (one-way or round trip)');
    }

    if (questions.length > 0) {
      content += '\n\n' + questions.map((q) => `• ${q}`).join('\n');
    } else {
      content += `\n\n🔍 Searching airlines now... I'll compare prices across Delta, United, American, Southwest, and more.`;
    }

    const suggestions = [
      { id: 'economy', label: 'Economy', description: 'Standard class', icon: '💺', action: 'class_economy' },
      { id: 'business', label: 'Business', description: 'Business class', icon: '✨', action: 'class_business' },
      { id: 'flexible', label: 'Flexible dates', description: 'Check nearby dates for better prices', icon: '📅', action: 'flexible_dates' },
      { id: 'nonstop', label: 'Nonstop only', description: 'No layovers', icon: '🎯', action: 'nonstop' },
    ];

    return {
      content,
      metadata: { type: 'preference_ask', suggestions, intent: 'search_flights', category: 'flights' },
    };
  }

  _handleSearchHotels(message, ctx) {
    let content = `🏨 I'll find the best hotels for you!`;

    const questions = [];
    if (!/in\s+\w+|near\s+\w+|at\s+\w+/i.test(message)) questions.push('**Location** — What city or area?');
    if (!/\b(night|nights|\d{1,2}\/\d{1,2})\b/i.test(message)) questions.push('**Dates** — Check-in and check-out dates?');

    if (questions.length > 0) {
      content += ` I just need a few details:\n\n` + questions.map((q) => `• ${q}`).join('\n');
    } else {
      content += `\n\n🔍 Searching now... I'll compare prices and ratings across Booking.com, Hotels.com, Airbnb, and more.`;
    }

    const suggestions = [
      { id: 'budget', label: 'Budget-friendly', description: 'Under $100/night', icon: '💰', action: 'budget' },
      { id: 'midrange', label: 'Mid-range', description: '$100-250/night', icon: '⭐', action: 'midrange' },
      { id: 'luxury', label: 'Luxury', description: '$250+/night', icon: '👑', action: 'luxury' },
      { id: 'pool', label: 'Pool required', description: 'Must have a pool', icon: '🏊', action: 'pool' },
    ];

    return {
      content,
      metadata: { type: 'preference_ask', suggestions, intent: 'search_hotels', category: 'hotels' },
    };
  }

  _handleSearchFood(message, ctx) {
    let content = `🍕 Let me find some great food options for you!`;

    if (ctx.profile?.dietaryPreferences?.length > 0) {
      content += `\n\nI'll keep your dietary preferences in mind: **${ctx.profile.dietaryPreferences.join(', ')}**`;
    }
    if (ctx.profile?.allergies?.length > 0) {
      content += `\nAvoiding allergens: **${ctx.profile.allergies.join(', ')}**`;
    }

    const suggestions = [
      { id: 'delivery', label: 'Delivery', description: 'Get it delivered', icon: '🚗', action: 'delivery' },
      { id: 'pickup', label: 'Pickup', description: 'Collect in person', icon: '🏃', action: 'pickup' },
      { id: 'grocery', label: 'Groceries', description: 'Order groceries', icon: '🛒', action: 'grocery' },
      { id: 'mealkit', label: 'Meal kits', description: 'Cook at home', icon: '👨‍🍳', action: 'mealkit' },
    ];

    return {
      content,
      metadata: { type: 'suggestions', suggestions, intent: 'search_food', category: 'food' },
    };
  }

  _handleSearchEvents(message, ctx) {
    let content = `🎫 Let's find some great events for you!\n\nI'll search across Ticketmaster, StubHub, SeatGeek, and more.`;

    const suggestions = [
      { id: 'concerts', label: 'Concerts', description: 'Live music events', icon: '🎵', action: 'concerts' },
      { id: 'sports', label: 'Sports', description: 'Games & matches', icon: '⚽', action: 'sports' },
      { id: 'theater', label: 'Theater', description: 'Shows & plays', icon: '🎭', action: 'theater' },
      { id: 'comedy', label: 'Comedy', description: 'Stand-up shows', icon: '😂', action: 'comedy' },
    ];

    return {
      content,
      metadata: { type: 'suggestions', suggestions, intent: 'search_events', category: 'events' },
    };
  }

  _handleSearchCars(message, ctx) {
    let content = `🚗 I'll find rental cars for you!\n\nI'll compare across Hertz, Enterprise, Avis, Turo, and more.`;

    const questions = [];
    if (!/in\s+\w+|at\s+\w+/i.test(message)) questions.push('**Location** — Where do you need the car?');
    if (!/\b(day|days|week|weekend|\d{1,2}\/\d{1,2})\b/i.test(message)) questions.push('**Dates** — Pickup and return dates?');

    if (questions.length > 0) {
      content += `\n\nJust need a few details:\n\n` + questions.map((q) => `• ${q}`).join('\n');
    }

    const suggestions = [
      { id: 'economy_car', label: 'Economy', description: 'Best value', icon: '🚗', action: 'economy_car' },
      { id: 'suv', label: 'SUV', description: 'More space', icon: '🚙', action: 'suv' },
      { id: 'luxury_car', label: 'Luxury', description: 'Premium ride', icon: '🏎️', action: 'luxury_car' },
      { id: 'airport', label: 'Airport pickup', description: 'Pick up at airport', icon: '✈️', action: 'airport' },
    ];

    return {
      content,
      metadata: { type: 'preference_ask', suggestions, intent: 'search_cars', category: 'cars' },
    };
  }

  _handlePriceInquiry(message, ctx) {
    const content = `💰 I can help you find the best price!\n\nI compare prices in real-time across multiple providers. Would you like me to:\n\n• **Search now** for the best current price\n• **Set a price alert** to notify you when it drops to your target\n• **Compare** across providers side by side`;

    const suggestions = [
      { id: 'search_now', label: 'Search now', description: 'Find current best price', icon: '🔍', action: 'search_now' },
      { id: 'price_alert', label: 'Set alert', description: 'Notify when price drops', icon: '🔔', action: 'price_alert' },
      { id: 'price_history', label: 'Price history', description: 'See how price has changed', icon: '📈', action: 'price_history' },
    ];

    return {
      content,
      metadata: { type: 'suggestions', suggestions, intent: 'price_inquiry' },
    };
  }

  _handleProfileHelp(message, ctx) {
    const lower = message.toLowerCase();
    let content = '';
    let suggestions = [];

    if (/size/i.test(lower)) {
      if (ctx.profile?.sizes?.shirtSize) {
        content = `📏 Here are your saved sizes:\n\n` +
          `• **Shirt:** ${ctx.profile.sizes.shirtSize || 'Not set'}\n` +
          `• **Pants:** ${ctx.profile.sizes.pantsSize || 'Not set'}\n` +
          `• **Shoes:** ${ctx.profile.sizes.shoeSize || 'Not set'}\n` +
          `• **Dress:** ${ctx.profile.sizes.dressSize || 'Not set'}\n\n` +
          `You can update these in **Settings**.`;
      } else {
        content = `📏 You haven't set up your clothing sizes yet! This helps me and your AI agents find the right fit.\n\nWhat sizes would you like to save?`;
        suggestions = [
          { id: 'go_settings', label: 'Go to Settings', description: 'Update your profile', icon: '⚙️', action: 'navigate_settings' },
        ];
      }
    } else if (/wallet/i.test(lower)) {
      content = ctx.hasWallet
        ? `💳 Your wallet is connected! You can view your balance and transactions in the **Wallet** tab.`
        : `💳 You haven't connected a USDC wallet yet. You'll need one to make purchases.\n\nGo to **Settings** or **Wallet** to connect one.`;
      suggestions = [
        { id: 'go_wallet', label: 'Go to Wallet', description: 'View wallet details', icon: '💰', action: 'navigate_wallet' },
      ];
    } else if (/address|shipping/i.test(lower)) {
      content = ctx.hasAddress
        ? `📦 You have a shipping address on file. You can manage your addresses in **Settings**.`
        : `📦 No shipping address set up yet. You'll need one before your agent can make purchases.\n\nWant to add one now?`;
      suggestions = [
        { id: 'go_settings', label: 'Go to Settings', description: 'Manage addresses', icon: '📍', action: 'navigate_settings' },
      ];
    } else {
      content = `I can help you with your profile settings! Here's what you can configure:\n\n` +
        `• **Sizes** — Clothing & shoe sizes for accurate shopping\n` +
        `• **Address** — Shipping address for deliveries\n` +
        `• **Wallet** — USDC wallet for payments\n` +
        `• **Preferences** — Favorite brands, categories, spending limits\n\n` +
        `What would you like to update?`;
    }

    return {
      content,
      metadata: { type: ctx.missingProfile.length > 0 ? 'preference_ask' : 'text', suggestions, intent: 'profile_help' },
    };
  }

  _handleOrderStatus(ctx) {
    if (ctx.recentOrders.length === 0) {
      return {
        content: `📦 You don't have any orders yet! Once you or your AI agent makes a purchase, you'll see all orders here.\n\nWant me to help you find something to buy?`,
        metadata: {
          type: 'suggestions',
          suggestions: this._getShoppingIdeas(ctx),
          intent: 'order_status',
        },
      };
    }

    const orderLines = ctx.recentOrders.slice(0, 5).map((o) => {
      const statusEmoji = {
        pending_approval: '⏳',
        approved: '✅',
        processing: '⚙️',
        purchasing: '🛒',
        confirmed: '✅',
        shipped: '📦',
        delivered: '🎉',
        cancelled: '❌',
        failed: '⚠️',
        refunded: '↩️',
      };
      return `• ${statusEmoji[o.status] || '•'} **${o.product?.title || 'Order'}** — ${o.status.replace(/_/g, ' ')} — $${o.payment?.amount?.toFixed(2) || '0.00'}`;
    });

    const content = `📦 Here are your recent orders:\n\n${orderLines.join('\n')}\n\nView full details in the **Orders** tab.`;

    return {
      content,
      metadata: { type: 'text', intent: 'order_status' },
    };
  }

  _handleRecommendations(ctx) {
    const ideas = this._getShoppingIdeas(ctx);
    let content = `Here are some personalized ideas for you, ${ctx.name}:`;

    // Make it context-aware
    if (ctx.preferences?.favoriteCategories?.length > 0) {
      content += `\n\nBased on your interests in **${ctx.preferences.favoriteCategories.join(', ')}**, I think you'd like these:`;
    }

    if (ctx.stats?.totalOrders > 0) {
      content += `\n\nYou've made ${ctx.stats.totalOrders} orders so far (avg $${ctx.stats.averageOrderValue?.toFixed(0) || '0'}). Here are some ideas:`;
    }

    return {
      content,
      metadata: { type: 'suggestions', suggestions: ideas, intent: 'recommendations' },
    };
  }

  _handleAgentHelp(ctx) {
    let content = '';

    if (ctx.connectedAgents > 0) {
      content = `🤖 You have **${ctx.connectedAgents} agent(s)** connected. You can manage them in the **Agents** tab.\n\nYour agents can search for products, book flights, find hotels, and make purchases on your behalf. They have access to your sizes, preferences, and shipping address to make smart decisions.`;
    } else {
      content = `🤖 You haven't connected any AI agents yet!\n\nAgents are AI bots (like OpenClawd, ChatGPT, or custom bots) that can shop on your behalf. To connect one:\n\n1. Go to the **Agents** tab\n2. Click **Register Agent**\n3. Give it a name and save the API credentials\n4. Use those credentials in your AI agent's code\n\nWant to set one up now?`;
    }

    const suggestions = [
      { id: 'go_agents', label: 'Go to Agents', description: 'Manage your agents', icon: '🤖', action: 'navigate_agents' },
    ];

    return {
      content,
      metadata: { type: 'text', suggestions, intent: 'agent_help' },
    };
  }

  _handleWalletInquiry(ctx) {
    let content = '';

    if (ctx.hasWallet) {
      content = `💳 Your wallet is connected. Here's what I know:\n\n• **Daily limit:** $${ctx.preferences?.spendingLimit?.daily || 500}\n• **Monthly limit:** $${ctx.preferences?.spendingLimit?.monthly || 5000}\n• **Auto-approve under:** $${ctx.preferences?.maxAutoApprove || 25}\n• **Total spent:** $${ctx.stats?.totalSpent?.toFixed(2) || '0.00'}\n\nVisit the **Wallet** tab for your full balance and transaction history.`;
    } else {
      content = `💳 You haven't connected a wallet yet. Swiftbuy uses USDC — a stablecoin pegged 1:1 to USD.\n\n**How it works:**\n1. Load USDC into your wallet\n2. When an agent buys something, USDC is off-ramped to fiat automatically\n3. The retailer gets paid, you get your item\n\nConnect your wallet in **Settings** to get started.`;
    }

    const suggestions = [
      { id: 'go_wallet', label: 'View Wallet', description: 'Check balance & transactions', icon: '💰', action: 'navigate_wallet' },
    ];

    return {
      content,
      metadata: { type: 'text', suggestions, intent: 'wallet_inquiry' },
    };
  }

  _handleGeneral(message, ctx) {
    // For unknown intents, be helpful and suggest things
    let content = `I'm here to help you with anything on Swiftbuy! I can:\n\n` +
      `🔍 **Search** for products, flights, hotels, food, events, cars\n` +
      `📦 **Track** your orders and deliveries\n` +
      `💰 **Compare** prices across providers\n` +
      `🔔 **Set alerts** for price drops\n` +
      `⚙️ **Manage** your profile, sizes, and preferences\n` +
      `🤖 **Help** with AI agent setup\n\n` +
      `Just tell me what you need!`;

    const suggestions = this._getQuickActions(ctx);

    return {
      content,
      metadata: { type: 'suggestions', suggestions, intent: 'general' },
    };
  }

  // ─── Helpers ───────────────────────────────────────────

  _generateGreeting(ctx) {
    const timeOfDay = new Date().getHours();
    const greeting = timeOfDay < 12 ? 'Good morning' : timeOfDay < 18 ? 'Good afternoon' : 'Good evening';

    let content = `${greeting}, ${ctx.name}! 👋 Welcome to Swiftbuy.\n\nI'm your personal shopping assistant. I can help you find and buy anything — products, flights, hotels, food, event tickets, and more.\n\n`;

    if (ctx.missingProfile.length >= 3) {
      content += `It looks like you're just getting started! Let me help you set things up, or feel free to jump right in and tell me what you're looking for.`;
    } else if (ctx.stats?.totalOrders > 0) {
      content += `You've made **${ctx.stats.totalOrders} orders** so far. What can I help you with today?`;
    } else {
      content += `What can I help you find today?`;
    }

    return content;
  }

  _generateWelcomeSuggestions(ctx) {
    const suggestions = [];

    // If missing critical profile info, nudge first
    if (!ctx.hasAddress) {
      suggestions.push({
        id: 'setup_address', label: 'Set up shipping address', description: 'Required for purchases', icon: '📍', action: 'navigate_settings',
      });
    }
    if (!ctx.hasWallet) {
      suggestions.push({
        id: 'setup_wallet', label: 'Connect USDC wallet', description: 'Required for payments', icon: '💳', action: 'navigate_wallet',
      });
    }
    if (ctx.connectedAgents === 0) {
      suggestions.push({
        id: 'setup_agent', label: 'Connect an AI agent', description: 'Let AI shop for you', icon: '🤖', action: 'navigate_agents',
      });
    }

    // Always include some action ideas
    suggestions.push(
      { id: 'find_products', label: 'Find me a product', description: 'Search across retailers', icon: '🛒', action: 'search_products' },
      { id: 'book_flight', label: 'Book a flight', description: 'Search flights', icon: '✈️', action: 'search_flights' },
      { id: 'find_hotel', label: 'Find a hotel', description: 'Search accommodations', icon: '🏨', action: 'search_hotels' },
      { id: 'order_food', label: 'Order food', description: 'Restaurants & delivery', icon: '🍕', action: 'search_food' },
      { id: 'find_events', label: 'Find events', description: 'Concerts, sports, shows', icon: '🎫', action: 'search_events' },
    );

    return suggestions.slice(0, 8); // Max 8
  }

  _getQuickActions(ctx) {
    const actions = [
      { id: 'find_products', label: 'Shop for products', description: 'Search across retailers', icon: '🛒', action: 'search_products' },
      { id: 'book_flight', label: 'Book a flight', description: 'Search airlines', icon: '✈️', action: 'search_flights' },
      { id: 'find_hotel', label: 'Find a hotel', description: 'Search accommodations', icon: '🏨', action: 'search_hotels' },
      { id: 'order_food', label: 'Order food', description: 'Restaurants & delivery', icon: '🍕', action: 'search_food' },
      { id: 'check_orders', label: 'Check my orders', description: 'Track purchases', icon: '📦', action: 'check_orders' },
    ];

    if (!ctx.hasWallet) {
      actions.unshift({ id: 'setup_wallet', label: 'Connect wallet', description: 'Set up USDC payments', icon: '💳', action: 'navigate_wallet' });
    }

    return actions.slice(0, 6);
  }

  _getShoppingIdeas(ctx) {
    // Context-aware recommendations
    const ideas = [
      { id: 'trending_tech', label: 'Trending tech deals', description: 'Best deals on electronics', icon: '📱', action: 'search_tech' },
      { id: 'weekend_getaway', label: 'Weekend getaway', description: 'Flights + hotels nearby', icon: '🏖️', action: 'search_getaway' },
      { id: 'gift_ideas', label: 'Gift ideas', description: 'Popular gifts right now', icon: '🎁', action: 'search_gifts' },
      { id: 'meal_delivery', label: 'Tonight\'s dinner', description: 'Order food delivery', icon: '🍕', action: 'search_food' },
      { id: 'concert_nearby', label: 'Events this week', description: 'Concerts & shows near you', icon: '🎵', action: 'search_events' },
      { id: 'fitness_gear', label: 'Fitness & wellness', description: 'Workout gear & supplements', icon: '💪', action: 'search_fitness' },
    ];

    return ideas;
  }
}

module.exports = new ChatService();




