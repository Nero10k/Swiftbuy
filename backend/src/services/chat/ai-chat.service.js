/**
 * AI Chat Service
 *
 * Replaces the rule-based chat.service.js with a real Claude-powered assistant
 * that can search, look up products by URL, initiate purchases, approve orders,
 * and check order status — all through natural conversation.
 *
 * Architecture:
 *   User message → Anthropic SDK (tool_use) → service layer (search, purchase, etc.)
 *   → Claude composes a human-friendly reply → saved to ChatMessage → returned to UI
 *
 * The chat UI (dashboard/chat) and chat controller are unchanged.
 * Only this service is swapped in.
 */

const Anthropic = require('@anthropic-ai/sdk');
const User = require('../../models/User');
const Order = require('../../models/Order');
const ChatMessage = require('../../models/ChatMessage');
const searchService = require('../search/search.service');
const purchaseService = require('../purchase/purchase.service');
const SearchSession = require('../../models/SearchSession');
const logger = require('../../utils/logger');
const { generateId } = require('../../utils/helpers');
const { getUserCountry, getGeoForCountry } = require('../../utils/geo');
const config = require('../../config');

const apiKey = process.env.ANTHROPIC_API_KEY || config.checkout.anthropicApiKey;
const client = new Anthropic({ apiKey: apiKey || 'missing' });

// ─── Model ──────────────────────────────────────────────────────────────────
// claude-3-5-haiku-20241022 reached EOL on 2026-02-19 — use haiku-4-5 instead.
// Override via CHAT_LLM_MODEL env var in Railway if you want a different model.
const CHAT_MODEL = process.env.CHAT_LLM_MODEL || 'claude-haiku-4-5-20251001';

// ─── System prompt ───────────────────────────────────────────────────────────
const BASE_SYSTEM_PROMPT = `You are Swiftbuy, the user's personal shopping assistant. You search, compare, and purchase — all within this conversation.

## Core behaviour

- **Be proactive.** If the user says "I need headphones", ask one clarifying question ("What's your budget? Any brand preference?") then search. Don't pepper them with multiple questions.
- **Be opinionated.** Don't list 10 options. Pick the top 2–3, explain WHY: "This one has the best reviews", "This is the best value for your budget."
- **Be transparent about money.** Always state the price clearly before purchasing. Example: "This will be charged from your wallet."
- **Confirm before buying.** Never auto-purchase without asking the user to confirm (unless the amount is under their auto-approve threshold).
- **Keep it concise.** Use markdown — **bold**, bullet points, numbered lists. It renders correctly in the UI. Don't dump raw data.
- **Never mention** tools, API calls, or internal system names to the user.

## Search flow

When the user asks for something:
1. If needed, ask ONE clarifying question (budget, preference, size) — then search immediately.
2. Call search_products with a specific query.
3. Present **2–3 options maximum**: name, price (in local currency), retailer, rating if available, and a direct link to the product using the url field — format it as [View on {retailer} →](url) (replace {retailer} with the actual retailer name).
4. Recommend the best one and ask: "Want me to order it?"

If the user references a previous result by name or number (e.g. "the second one", "Little Dutch", "option 3"), **do NOT search again** — use the product data already shown in the conversation to initiate the purchase.

## URL lookup flow

When the user pastes a product URL:
1. Call lookup_product_url to get the title and price.
2. If it succeeds → confirm with the user: "I found **[title]** for €[price] at [retailer]. Shall I order it?"
3. If it fails or priceFound is false → **do NOT retry or search** — ask the user directly: "I found the product but couldn't read the price. What price do you see on the page?" Then call initiate_purchase with the URL and the price they give you.
4. **Never call lookup_product_url more than once per URL** — if it fails, move on immediately.

## Profile check

Before purchasing clothing, shoes, or food, call get_user_profile to check:
- Sizes (shoes, shirt, etc.) — if missing, ask the user before ordering
- Dietary preferences and allergies — filter food results accordingly
- Default shipping address — confirm it's correct for physical goods
- Phone number — warn the user if it's missing (some retailers block checkout without one)

## Purchase & approval flow

1. Call initiate_purchase with the product data.
2. If the response contains missingInfo — tell the user what's missing before approving.
3. If requiresApproval is true, ask the user directly AND always embed the EXACT orderId from the initiate_purchase tool response (never invent one):
   > I've prepared your order: **[product]** — [price]. Should I go ahead and confirm?
   > order_ref:[EXACT orderId from tool response — e.g. 68a3f9c2e4b0123456789abc]
   CRITICAL: The orderId is the value returned in the \`orderId\` field of the initiate_purchase result. Never write "pending_order_001" or any placeholder — always use the actual value.
4. When the user says yes ("yes", "go ahead", "book it", "confirm"):
   - Look in the recent conversation for the "order_ref:" line to get the orderId.
   - If you can't find it in the text, call get_recent_orders to find the most recent pending order.
   - Call approve_order with that orderId.
5. After approve_order returns success, **immediately return a text response** — do NOT call get_order_status in this same turn. Say:
   > 🔄 Order submitted! The checkout is running in the background.
   > Reply **"status"** or **"check my order"** anytime to see if it's confirmed.
6. When the user asks for status ("status", "check order", "where is my order"), call get_order_status with the orderId from the conversation, then report the result.
7. If the user says no, call reject_order. Say: "No problem — cancelled. Your wallet hasn't been charged. Want me to find something else?"

## Geo & currency rules

- User's location and currency are injected below — ALWAYS use that currency symbol. Never assume USD.
- Include the country in search queries for local results (e.g. "children's book Netherlands").
- Present prices exactly as returned — never convert currencies.
- Skip retailers that require an account (Amazon, bol.com, Zalando, AliExpress, eBay) — they can't be checked out automatically.

## Error handling (never show error codes to the user)

- INSUFFICIENT_FUNDS → "You don't have enough in your wallet for this. Want to add funds?"
- CHECKOUT_FAILED → "The checkout didn't complete on [retailer] — they may require an account. Want me to find the same product on a different store?"
- URL_RESOLUTION_FAILED → "I couldn't find a direct link to that product on [retailer]'s website. Could you paste the product page URL directly in chat?"
- PRODUCT_NOT_FOUND → "That product isn't available anymore. Want me to search again?"
- NO_WALLET → "You'll need to connect your wallet first — go to your dashboard > Wallet to set it up."
- DAILY_LIMIT_EXCEEDED → "This would put you over your daily spending limit. Want me to find a cheaper option?"`;

function buildSystemPrompt(geo) {
  const countryLine = geo
    ? `\n\nUser's location: **${geo.name}** — always show prices in ${geo.currencySymbol} (${geo.currency}).`
    : '';
  return BASE_SYSTEM_PROMPT + countryLine;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'search_products',
    description: 'Search for products, flights, hotels, food, events, or car rentals across the web. Use this when the user asks to find or buy something without providing a specific URL.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query, e.g. "wireless headphones under €100" or "flight Amsterdam to Barcelona next Friday"' },
        max_price: { type: 'number', description: 'Optional maximum price filter' },
        min_price: { type: 'number', description: 'Optional minimum price filter' },
        limit: { type: 'number', description: 'Max results to return (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'lookup_product_url',
    description: 'Fetch a specific product page by URL and extract the title and price. Use this when the user pastes a direct link to a product.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full product URL provided by the user' },
      },
      required: ['url'],
    },
  },
  {
    name: 'initiate_purchase',
    description: 'Create a purchase order for a product. Call this after the user has confirmed they want to buy something. Pass the product data from search or lookup results.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Product title' },
        price: { type: 'number', description: 'Product price' },
        url: { type: 'string', description: 'Product URL' },
        retailer: { type: 'string', description: 'Retailer name' },
        image: { type: 'string', description: 'Product image URL (optional)' },
        category: { type: 'string', description: 'Product category (optional)' },
      },
      required: ['title', 'price', 'url'],
    },
  },
  {
    name: 'approve_order',
    description: 'Approve a pending order after the user says yes. Use the orderId from initiate_purchase.',
    input_schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'The order ID to approve' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'reject_order',
    description: 'Cancel a pending order if the user says no.',
    input_schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'The order ID to reject' },
        reason: { type: 'string', description: 'Why the order was rejected' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_order_status',
    description: 'Check the current status of an order. Poll this after approving until status is "confirmed" or "failed".',
    input_schema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'The order ID to check' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_recent_orders',
    description: 'Get the user\'s recent orders. Use when the user asks about their orders or delivery status.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Number of recent orders to fetch (default 5)' },
      },
      required: [],
    },
  },
  {
    name: 'get_user_profile',
    description: 'Get the user\'s profile including saved sizes, dietary preferences, allergies, and shipping address. Check this before purchasing clothing/shoes.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ─── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, userId) {
  const user = await User.findById(userId).lean();
  if (!user) throw new Error('User not found');

  switch (toolName) {
    case 'search_products': {
      const userCountry = getUserCountry(user.shippingAddresses);
      const geo = getGeoForCountry(userCountry);
      const filters = {};
      if (toolInput.max_price) filters.max_price = toolInput.max_price;
      if (toolInput.min_price) filters.min_price = toolInput.min_price;

      const limit = toolInput.limit || 5;
      // Append country to the query when Claude hasn't already included it,
      // so the underlying search engine surfaces local retailers.
      const queryLower = toolInput.query.toLowerCase();
      const countryHint = geo.name.toLowerCase();
      const needsHint = !queryLower.includes(countryHint) && userCountry !== 'US';
      const effectiveQuery = needsHint ? `${toolInput.query} ${geo.name}` : toolInput.query;
      const results = await searchService.search(effectiveQuery, filters, limit, {}, geo);

      // Save search session (product detail page reads from this)
      let sessionId = null;
      if (results.products?.length > 0) {
        sessionId = generateId('srch');
        try {
          await SearchSession.create({
            sessionId,
            userId,
            query: toolInput.query,
            products: results.products.map((p) => ({
              title: p.title,
              price: p.price,
              currency: geo.currency,
              currencySymbol: geo.currencySymbol,
              retailer: p.retailer,
              url: p.url,
              imageUrl: p.imageUrl || p.image || '',
              image: p.image || p.imageUrl || '',
              rating: p.rating,
              reviewCount: p.reviewCount,
            })),
            geo: { country: userCountry, countryName: geo.name, currency: geo.currency, currencySymbol: geo.currencySymbol },
          });
        } catch (e) {
          logger.warn(`Failed to save search session: ${e.message}`);
        }
      }

      const products = (results.products || []).map((p) => ({
        title: p.title,
        price: p.price,
        currency: geo.currency,
        currencySymbol: geo.currencySymbol,
        retailer: p.retailer,
        url: p.url,
        image: p.image || p.imageUrl || '',
        rating: p.rating,
      }));

      return {
        products,
        count: products.length,
        currency: geo.currency,
        currencySymbol: geo.currencySymbol,
        country: geo.name,
      };
    }

    case 'lookup_product_url': {
      const url = toolInput.url;
      let parsedUrl;
      try { parsedUrl = new URL(url); } catch { return { error: 'Invalid URL' }; }

      const domain = parsedUrl.hostname.replace('www.', '');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      let html = '';
      try {
        const resp = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
          },
        });
        html = await resp.text();
      } finally {
        clearTimeout(timeout);
      }

      let title = '';
      let price = null;
      let image = '';

      // JSON-LD
      const jsonLdBlocks = html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
      for (const block of jsonLdBlocks) {
        try {
          const inner = block.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
          const data = JSON.parse(inner);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item['@type'] === 'Product' || item['@type']?.includes?.('Product')) {
              if (!title && item.name) title = item.name;
              if (!image && item.image) image = Array.isArray(item.image) ? item.image[0] : item.image;
              const offers = item.offers || item.Offers;
              if (offers && !price) {
                const offer = Array.isArray(offers) ? offers[0] : offers;
                const raw = offer.price || offer.lowPrice;
                if (raw) price = parseFloat(String(raw).replace(/[^0-9.]/g, ''));
              }
            }
          }
        } catch { /* skip */ }
      }

      if (!title) {
        const ogTitle = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i);
        const metaTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        title = ogTitle?.[1] || metaTitle?.[1] || '';
      }
      if (!image) {
        const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
        image = ogImage?.[1] || '';
      }
      if (!price) {
        const priceMeta = html.match(/<meta[^>]+(?:property="product:price:amount"|name="price"|itemprop="price")[^>]+content="([^"]+)"/i)
          || html.match(/<meta[^>]+content="([^"]+)"[^>]+(?:property="product:price:amount"|name="price"|itemprop="price")/i);
        if (priceMeta?.[1]) price = parseFloat(priceMeta[1].replace(/[^0-9.]/g, ''));
      }

      title = title.trim().replace(/\s+/g, ' ').substring(0, 200);
      if (!title) return { error: `Could not extract product details from ${domain}. The site may block automated access.` };

      return { title, price, retailer: domain, url, image, priceFound: price !== null };
    }

    case 'initiate_purchase': {
      const order = await purchaseService.initiatePurchase({
        userId,
        product: {
          title: toolInput.title,
          price: toolInput.price,
          url: toolInput.url,
          retailer: toolInput.retailer || new URL(toolInput.url).hostname.replace('www.', ''),
          image: toolInput.image || '',
          category: toolInput.category || 'product',
        },
        agentId: 'dashboard_chat',
        agentConversationId: null,
      });

      return {
        orderId: order._id.toString(),
        status: order.status,
        requiresApproval: order.status === 'pending_approval',
        amount: order.payment?.amount,
        currency: order.payment?.currency,
        missingInfo: order.missingInfo || null,
      };
    }

    case 'approve_order': {
      // Robust lookup — the LLM sometimes hallucinates a placeholder ID instead of
      // using the real MongoDB _id returned by initiate_purchase. We try three
      // strategies so approval always works:
      //   1. MongoDB _id (the correct case)
      //   2. orderId string field on the document
      //   3. Most-recent pending_approval order for this user (ultimate fallback)
      let order = null;

      if (toolInput.orderId && /^[0-9a-fA-F]{24}$/.test(toolInput.orderId)) {
        order = await Order.findOne({ _id: toolInput.orderId, userId });
      }
      if (!order) {
        order = await Order.findOne({ orderId: toolInput.orderId, userId });
      }
      if (!order) {
        // Fallback: use the most recent pending order — handles hallucinated IDs
        order = await Order.findOne({ userId, status: 'pending_approval' }).sort({ createdAt: -1 });
        if (order) {
          logger.warn(`[AiChat] approve_order: ID "${toolInput.orderId}" not found — falling back to most recent pending order ${order._id}`);
        }
      }

      if (!order) return { error: 'No pending order found to approve' };
      if (order.userId.toString() !== userId.toString()) return { error: 'Not authorized' };

      // Fire and forget — don't await the full checkout (takes 60-90s)
      purchaseService.approveOrder(order._id.toString(), userId).catch((err) => {
        logger.warn(`[AiChat] approveOrder background error: ${err.message}`);
      });
      return { success: true, orderId: order._id.toString(), status: 'processing', message: 'Order approved and checkout started. Use get_order_status to check progress.' };
    }

    case 'reject_order': {
      const order = await Order.findById(toolInput.orderId);
      if (!order) return { error: 'Order not found' };
      if (order.userId.toString() !== userId.toString()) return { error: 'Not authorized' };

      await purchaseService.rejectOrder(toolInput.orderId, userId, toolInput.reason || 'User cancelled');
      return { success: true, orderId: toolInput.orderId, status: 'rejected' };
    }

    case 'get_order_status': {
      const order = await Order.findById(toolInput.orderId).lean();
      if (!order) return { error: 'Order not found' };
      if (order.userId.toString() !== userId.toString()) return { error: 'Not authorized' };

      return {
        orderId: order._id.toString(),
        status: order.status,
        product: order.product?.title,
        amount: order.payment?.amount,
        retailerOrderId: order.retailerOrderId || null,
        updatedAt: order.updatedAt,
      };
    }

    case 'get_recent_orders': {
      const limit = toolInput.limit || 5;
      const orders = await Order.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();
      return {
        orders: orders.map((o) => ({
          orderId: o._id.toString(),
          status: o.status,
          product: o.product?.title,
          retailer: o.product?.retailer,
          amount: o.payment?.amount,
          currency: o.payment?.currency,
          createdAt: o.createdAt,
        })),
      };
    }

    case 'get_user_profile': {
      const address = user.shippingAddresses?.find((a) => a.isDefault) || user.shippingAddresses?.[0];
      return {
        name: user.name,
        email: user.email,
        phone: user.profile?.phone || address?.phone || null,
        sizes: user.profile?.sizes || {},
        dietaryPreferences: user.profile?.dietaryPreferences || [],
        allergies: user.profile?.allergies || [],
        shippingAddress: address
          ? { fullName: address.fullName || user.name, street: address.street, city: address.city, state: address.state, zipCode: address.zipCode, country: address.country }
          : null,
        hasWallet: !!user.walletAddress,
        preferences: {
          requireApproval: user.preferences?.requireApproval ?? true,
          maxAutoApprove: user.preferences?.maxAutoApprove || 25,
        },
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Main service ─────────────────────────────────────────────────────────────

class AiChatService {
  /**
   * Process a user message and generate an AI response.
   * Handles multi-turn tool use in a loop until Claude returns a text reply.
   */
  async processMessage(userId, conversationId, userMessage) {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error('User not found');

    // Resolve geo once per request so the system prompt is country-aware
    const userCountry = getUserCountry(user.shippingAddresses);
    const geo = getGeoForCountry(userCountry);
    const systemPrompt = buildSystemPrompt(geo);

    // Save user message
    await ChatMessage.create({ userId, conversationId, role: 'user', content: userMessage });

    // Build Anthropic message history from stored conversation
    const history = await ChatMessage.getConversation(conversationId, 40);
    // history includes the message we just saved — use messages before the last one for context
    // Format: [{role, content}] — tool_use/tool_result pairs need special handling
    const anthropicMessages = this._buildAnthropicHistory(history, userMessage);

    // ── Agentic loop — race against Railway's 30s request timeout ────────────
    // Railway kills the TCP socket at 30s. We must send a response before that.
    // We give ourselves 27s; if the loop isn't done, we return a friendly fallback.
    const WALL_CLOCK_MS = 27000;

    const loopPromise = this._runAgenticLoop([...anthropicMessages], systemPrompt, userId);
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ timedOut: true }), WALL_CLOCK_MS)
    );

    const result = await Promise.race([loopPromise, timeoutPromise]);

    let finalText;
    if (result.timedOut) {
      logger.warn('[AiChat] Wall-clock budget exceeded — returning friendly timeout message');
      finalText = "That's taking longer than usual — the search may be slow right now. Please try again, or try a more specific query (e.g. add a brand or budget).";
    } else {
      finalText = result.text || "I didn't get a response — please try again.";
    }

    // Save and return the assistant reply
    const saved = await ChatMessage.create({
      userId,
      conversationId,
      role: 'assistant',
      content: finalText,
    });

    return {
      id: saved._id,
      role: 'assistant',
      content: finalText,
      createdAt: saved.createdAt,
    };
  }

  /**
   * Welcome message — still personalised, no AI call needed.
   */
  async getWelcomeMessage(userId) {
    const user = await User.findById(userId).lean();
    if (!user) throw new Error('User not found');

    const name = user.name?.split(' ')[0] || 'there';
    const hasAddress = user.shippingAddresses?.length > 0;
    const hasWallet = !!user.walletAddress;

    let content = `Hey ${name}! I'm your Swiftbuy assistant. Tell me what you're looking for and I'll search, compare, and buy it for you.\n\nYou can also paste a product link and I'll handle the rest.`;

    const suggestions = [];
    if (!hasAddress) suggestions.push({ id: 'setup_address', label: 'Add shipping address', description: 'Required for purchases', icon: '📍', action: 'navigate_settings' });
    if (!hasWallet) suggestions.push({ id: 'setup_wallet', label: 'Connect wallet', description: 'Required for payments', icon: '💳', action: 'navigate_wallet' });
    suggestions.push(
      { id: 'find_products', label: 'Find me a product', description: 'Search across retailers', icon: '🛒', action: 'search_products' },
      { id: 'book_flight', label: 'Book a flight', description: 'Search flights', icon: '✈️', action: 'search_flights' },
      { id: 'check_orders', label: 'Check my orders', description: 'Track purchases', icon: '📦', action: 'check_orders' },
    );

    return {
      role: 'assistant',
      content,
      metadata: { type: 'suggestions', suggestions: suggestions.slice(0, 5) },
    };
  }

  /**
   * Convert stored ChatMessage documents to Anthropic messages format.
   * history is sorted oldest-first and includes the current user message as the last entry.
   * We use history[0..n-2] as prior context, then append the current user message.
   * Only text-role messages are included (tool_use pairs are not persisted).
   */
  _buildAnthropicHistory(history, currentMessage) {
    const messages = [];

    // All messages except the last one (which is the user turn we just saved)
    const priorMessages = history.slice(0, -1);

    for (const msg of priorMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Ensure alternating roles — Anthropic requires user/assistant/user/...
    // If history has consecutive same-role messages (shouldn't happen normally), collapse them
    const deduped = [];
    for (const msg of messages) {
      const prev = deduped[deduped.length - 1];
      if (prev && prev.role === msg.role) {
        prev.content += '\n' + msg.content; // merge same-role messages
      } else {
        deduped.push({ ...msg });
      }
    }

    // Always end with the current user message
    deduped.push({ role: 'user', content: currentMessage });

    return deduped;
  }

  /**
   * Run the agentic tool-use loop and resolve with { text } on success.
   * On any AI/network error, resolves (not rejects) with a friendly { text } fallback
   * so the caller's Promise.race always gets a usable result.
   */
  async _runAgenticLoop(loopMessages, systemPrompt, userId) {
    const MAX_TOOL_ROUNDS = 8;
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await client.messages.create(
          {
            model: CHAT_MODEL,
            max_tokens: 2048,
            system: systemPrompt,
            tools: TOOLS,
            messages: loopMessages,
          },
          { timeout: 22000 } // 22s per call — leaves room for tool execution + response
        );

        if (response.stop_reason === 'end_turn') {
          const text = response.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();
          return { text };
        }

        if (response.stop_reason === 'tool_use') {
          const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
          const toolResultBlocks = [];

          for (const toolUse of toolUseBlocks) {
            logger.info(`[AiChat] Tool call: ${toolUse.name} — ${JSON.stringify(toolUse.input).substring(0, 120)}`);
            let result;
            try {
              result = await executeTool(toolUse.name, toolUse.input, userId);
            } catch (err) {
              logger.warn(`[AiChat] Tool ${toolUse.name} error: ${err.message}`);
              result = { error: err.message };
            }

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: JSON.stringify(result),
            });
          }

          loopMessages = [
            ...loopMessages,
            { role: 'assistant', content: response.content },
            { role: 'user', content: toolResultBlocks },
          ];
          continue;
        }

        // Unexpected stop reason
        logger.warn(`[AiChat] Unexpected stop_reason: ${response.stop_reason}`);
        const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
        return { text };
      }

      return { text: "I reached my limit on this request. Please try again." };
    } catch (aiErr) {
      const status = aiErr.status || aiErr.statusCode || 0;
      const errType = aiErr.error?.type || aiErr.type || 'unknown';
      // Log the FULL error details so Railway logs show exactly what failed
      logger.error(`[AiChat] AI loop error — status=${status} type=${errType} model=${CHAT_MODEL} message=${aiErr.message}`);

      if (status === 401 || aiErr.message?.toLowerCase().includes('authentication') || aiErr.message?.toLowerCase().includes('api key')) {
        // API key missing or invalid — this is a configuration issue
        logger.error(`[AiChat] ⚠️ Anthropic API key is missing or invalid — set ANTHROPIC_API_KEY in Railway env vars`);
        return { text: "I'm temporarily unavailable due to a configuration issue. Please try again shortly." };
      } else if (status === 429) {
        return { text: "I'm getting a lot of requests right now — give me a moment and try again." };
      } else if (status === 400) {
        logger.error(`[AiChat] Bad request (400) — possible invalid model name: "${CHAT_MODEL}". Full error: ${JSON.stringify(aiErr.error || aiErr.message)}`);
        return { text: "I'm temporarily unavailable due to a service issue. Please try again shortly." };
      } else if (status === 529 || status === 503 || status === 500) {
        return { text: "Anthropic is temporarily overloaded. Give me a moment and try again." };
      } else if (aiErr.message?.toLowerCase().includes('timeout') || aiErr.code === 'ECONNABORTED' || aiErr.code === 'UND_ERR_CONNECT_TIMEOUT') {
        return { text: "That search took too long. Try adding a budget or brand to your query to speed things up." };
      } else {
        return { text: "I ran into an issue on my end. Please try sending your message again." };
      }
    }
  }
}

module.exports = new AiChatService();
