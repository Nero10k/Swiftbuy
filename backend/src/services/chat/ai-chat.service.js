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
const CHAT_MODEL = process.env.CHAT_LLM_MODEL || 'claude-haiku-4-5-20251001';

// ─── System prompt ───────────────────────────────────────────────────────────
// Keep this focused on behaviour; the tools define the capabilities.
const BASE_SYSTEM_PROMPT = `You are the Swiftbuy shopping assistant, embedded directly in the user's dashboard.
You can search for products, look up a specific product by URL, start a purchase, approve orders, and check order status.
All of these capabilities are available as tools — use them instead of making up prices or product details.

Rules:
- Always show the price before asking the user to confirm a purchase.
- Never confirm an order is "done" until you have polled the order status and it is "confirmed".
- After approving an order, poll every 15 seconds until the status is confirmed or failed. Tell the user you are waiting.
- For clothing and shoes: check if the user has saved sizes before purchasing. If not, ask.
- Keep replies concise and friendly. Use markdown (bold, bullet points) — it renders correctly in the UI.
- When presenting search results, show 2-3 options maximum with name, price, retailer, and the viewUrl as a markdown link.
- Do not mention "tools", "API calls", or internal system names to the user.

Geo & currency rules:
- The user's country and currency are injected below. ALWAYS use that currency symbol when displaying prices — never assume USD.
- When calling search_products, include the country/region in the query to get local results (e.g. "children's book Netherlands" not just "children's book").
- Results come from local retailers for the user's country. Present them as-is — do not convert currencies.
- Retailers that require an account (Amazon, bol.com, Zalando, AliExpress, eBay) cannot be checked out automatically. Skip them in favour of the next option if they appear in results.`;

function buildSystemPrompt(geo) {
  const countryLine = geo
    ? `\nUser's location: ${geo.name} — always show prices in ${geo.currencySymbol} (${geo.currency}).`
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
    },
  },
  {
    name: 'get_user_profile',
    description: 'Get the user\'s profile including saved sizes, dietary preferences, allergies, and shipping address. Check this before purchasing clothing/shoes.',
    input_schema: {
      type: 'object',
      properties: {},
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

      // Save search session for viewUrl links
      const frontendUrl = process.env.FRONTEND_URL || 'https://swiftbuy-app.vercel.app';
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

      const products = (results.products || []).map((p, i) => ({
        title: p.title,
        price: p.price,
        currency: geo.currency,
        currencySymbol: geo.currencySymbol,
        retailer: p.retailer,
        url: p.url,
        image: p.image || p.imageUrl || '',
        rating: p.rating,
        viewUrl: sessionId ? `${frontendUrl}/product/${sessionId}/${i}` : undefined,
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
      const timeout = setTimeout(() => controller.abort(), 10000);
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
      const order = await Order.findById(toolInput.orderId);
      if (!order) return { error: 'Order not found' };
      if (order.userId.toString() !== userId.toString()) return { error: 'Not authorized' };

      // Fire and forget — don't await the full checkout (takes 60-90s)
      // Just kick it off and let the user poll via get_order_status
      purchaseService.approveOrder(toolInput.orderId, userId).catch((err) => {
        logger.warn(`[AiChat] approveOrder background error: ${err.message}`);
      });
      return { success: true, orderId: toolInput.orderId, status: 'processing', message: 'Order approved and checkout started. Use get_order_status to check progress.' };
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

    // ── Agentic loop ─────────────────────────────────────
    let finalText = '';
    let loopMessages = [...anthropicMessages];
    const MAX_TOOL_ROUNDS = 8; // prevent infinite loops

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: CHAT_MODEL,
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages: loopMessages,
      });

      if (response.stop_reason === 'end_turn') {
        // Claude returned a text response — we're done
        finalText = response.content
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        break;
      }

      if (response.stop_reason === 'tool_use') {
        // Execute all tool calls in this turn
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

        // Append assistant's tool_use turn + tool results to the loop
        loopMessages = [
          ...loopMessages,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResultBlocks },
        ];
        continue;
      }

      // Unexpected stop reason
      logger.warn(`[AiChat] Unexpected stop_reason: ${response.stop_reason}`);
      finalText = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      break;
    }

    if (!finalText) {
      finalText = "Sorry, I couldn't complete that request. Please try again.";
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
}

module.exports = new AiChatService();
