#!/usr/bin/env node

/**
 * End-to-End Agent Flow Test
 *
 * Simulates EXACTLY what an OpenClaw agent does when a user asks to buy something.
 * Runs against the local Swiftbuy API.
 *
 * Prerequisites:
 *   1. Backend running: cd backend && npm run dev
 *   2. User account with:
 *      - Shipping address (onboarding complete)
 *      - Karma wallet connected (sk_live + sk_agent + active card)
 *      - At least one connected agent
 *   3. SERPER_API_KEY set (for real Google Shopping search)
 *   4. ANTHROPIC_API_KEY set (for checkout automation)
 *
 * Usage:
 *   node test-e2e-flow.js [--dry-run] [--query "your search query"]
 *
 * Flags:
 *   --dry-run    Stop after search + purchase creation (don't approve/checkout)
 *   --query      Custom search query (default: "Allbirds Tree Runners size 10")
 *   --mock       Skip real checkout, just test the API flow with mock
 */

require('dotenv').config();

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';

// ─── Parse CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MOCK_CHECKOUT = args.includes('--mock');
const queryIdx = args.indexOf('--query');
const SEARCH_QUERY = queryIdx !== -1 ? args[queryIdx + 1] : 'Allbirds Tree Runners size 10';

// ─── Colors for terminal output ────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(emoji, msg, data) {
  console.log(`${emoji}  ${msg}`);
  if (data) console.log(`   ${c.dim}${JSON.stringify(data, null, 2).split('\n').join('\n   ')}${c.reset}`);
}

function header(msg) {
  console.log(`\n${c.bright}${c.cyan}═══ ${msg} ═══${c.reset}\n`);
}

// ─── API helper ────────────────────────────────────────────────────
async function api(method, path, body = null, token = null) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  const json = await res.json();

  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.error?.message || JSON.stringify(json)}`);
  }

  return json;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ═══════════════════════════════════════════════════════════════════
// MAIN TEST FLOW
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bright}${c.magenta}┌────────────────────────────────────────────────┐${c.reset}`);
  console.log(`${c.bright}${c.magenta}│  Swiftbuy End-to-End Agent Flow Test           │${c.reset}`);
  console.log(`${c.bright}${c.magenta}└────────────────────────────────────────────────┘${c.reset}`);
  console.log(`${c.dim}   Base URL: ${BASE_URL}${c.reset}`);
  console.log(`${c.dim}   Query:    "${SEARCH_QUERY}"${c.reset}`);
  console.log(`${c.dim}   Dry run:  ${DRY_RUN}${c.reset}`);
  console.log(`${c.dim}   Mock:     ${MOCK_CHECKOUT}${c.reset}`);

  // ──────────────────────────────────────────────────────────────
  // STEP 0: Login as user to get agent token
  // ──────────────────────────────────────────────────────────────
  header('Step 0: Get Agent Token');

  // We need an agent token. Let's first login as the user to find their agents.
  let AGENT_TOKEN = process.env.TEST_AGENT_TOKEN;

  if (!AGENT_TOKEN) {
    const email = process.env.TEST_USER_EMAIL;
    const password = process.env.TEST_USER_PASSWORD;

    if (!email || !password) {
      console.log(`${c.red}ERROR: Set TEST_AGENT_TOKEN or (TEST_USER_EMAIL + TEST_USER_PASSWORD) in .env${c.reset}`);
      console.log(`\nTo get an agent token:`);
      console.log(`  1. Go to Swiftbuy dashboard → Agents`);
      console.log(`  2. Create an agent`);
      console.log(`  3. Copy the Bearer token`);
      console.log(`  4. Set TEST_AGENT_TOKEN=<token> in .env`);
      process.exit(1);
    }

    log('🔑', 'Logging in as user to find agent...');
    const loginRes = await api('POST', '/auth/login', { email, password });
    const userToken = loginRes.data.token;

    // Get dashboard to find connected agents
    const dashRes = await api('GET', '/user/dashboard', null, userToken);
    const user = dashRes.data.user;

    if (!user.connectedAgents || user.connectedAgents.length === 0) {
      console.log(`${c.red}ERROR: No connected agents found. Create one on the dashboard first.${c.reset}`);
      process.exit(1);
    }

    // The agent token should have been saved when creating the agent.
    // For testing, we can generate a new one using the user's JWT secret.
    console.log(`${c.yellow}⚠ Found ${user.connectedAgents.length} agent(s) but no TEST_AGENT_TOKEN set.${c.reset}`);
    console.log(`${c.yellow}  Set TEST_AGENT_TOKEN in .env (the Bearer token from agent creation).${c.reset}`);
    process.exit(1);
  }

  log('✅', 'Agent token loaded');

  // ──────────────────────────────────────────────────────────────
  // STEP 1: GET /agent/me — Who am I?
  // ──────────────────────────────────────────────────────────────
  header('Step 1: GET /agent/me — Agent Identity');

  const meRes = await api('GET', '/agent/me', null, AGENT_TOKEN);
  const userId = meRes.data.user.userId;
  const agentName = meRes.data.agent.agentName;
  const hasWallet = meRes.data.user.hasWallet;
  const hasAddress = meRes.data.user.hasAddress;

  log('🤖', `Agent: ${agentName}`);
  log('👤', `User: ${meRes.data.user.name} (${userId})`);
  log('💳', `Wallet: ${hasWallet ? 'connected' : '❌ NOT CONNECTED'}`);
  log('📍', `Address: ${hasAddress ? 'set' : '❌ NOT SET'}`);

  if (!hasWallet && !DRY_RUN) {
    console.log(`\n${c.red}⛔ Wallet not connected. Go to Dashboard → Wallet to connect Karma.${c.reset}`);
    console.log(`${c.yellow}   (Use --dry-run to skip this check and just test search + order creation)${c.reset}`);
    process.exit(1);
  } else if (!hasWallet) {
    console.log(`${c.yellow}⚠ Wallet not connected — OK for dry-run (search + create order only)${c.reset}`);
  }
  if (!hasAddress) {
    console.log(`\n${c.red}⛔ No shipping address. Go to Dashboard → Settings to add one.${c.reset}`);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 2: POST /agent/search — Search for products
  // ──────────────────────────────────────────────────────────────
  header(`Step 2: POST /agent/search — "${SEARCH_QUERY}"`);

  const searchRes = await api('POST', '/agent/search', {
    user_id: userId,
    query: SEARCH_QUERY,
    limit: 5,
  }, AGENT_TOKEN);

  const products = searchRes.data.products;
  const meta = searchRes.data.meta;

  log('🔍', `Found ${products.length} products (source: ${meta.source}, geo: ${meta.geo?.countryName || 'US'})`);

  if (products.length === 0) {
    console.log(`\n${c.red}⛔ No search results. Check SERPER_API_KEY in .env.${c.reset}`);
    process.exit(1);
  }

  // Show top 3
  products.slice(0, 3).forEach((p, i) => {
    const price = `${meta.geo?.currencySymbol || '$'}${p.price}`;
    const urlInfo = p.url ? `${p.url.substring(0, 60)}...` : 'NO URL';
    const isGooglePage = p._isGoogleShoppingPage ? ' ⚠️ GOOGLE PAGE' : '';
    log(`  ${i + 1}.`, `${p.title.substring(0, 60)} — ${price} from ${p.retailer}${isGooglePage}`);
    log('    ', `URL: ${urlInfo}`);
  });

  console.log(`\n${c.dim}Agent message: ${searchRes.data.agentMessage}${c.reset}`);

  // Pick the first product with a valid URL (not a Google Shopping page)
  const selectedProduct = products.find((p) => p.url && !p._isGoogleShoppingPage) || products[0];

  if (!selectedProduct) {
    console.log(`\n${c.red}⛔ No product with valid URL found.${c.reset}`);
    process.exit(1);
  }

  log('👆', `Selected: "${selectedProduct.title.substring(0, 60)}" at ${meta.geo?.currencySymbol || '$'}${selectedProduct.price}`);

  // ──────────────────────────────────────────────────────────────
  // STEP 3: POST /agent/purchase — Create the order
  // ──────────────────────────────────────────────────────────────
  header('Step 3: POST /agent/purchase — Create Order');

  const purchaseRes = await api('POST', '/agent/purchase', {
    user_id: userId,
    product: {
      title: selectedProduct.title,
      price: selectedProduct.price,
      retailer: selectedProduct.retailer,
      url: selectedProduct.url,
      image: selectedProduct.images?.[0] || selectedProduct.imageUrl,
      category: selectedProduct.category || 'product',
    },
    auto_approve: false,
  }, AGENT_TOKEN);

  const orderData = purchaseRes.data.order;
  log('📦', `Order created: ${orderData.orderId}`);
  log('💰', `Amount: $${orderData.payment.amount}`);
  log('📋', `Status: ${orderData.status}`);
  log('🔐', `Requires approval: ${orderData.requiresApproval}`);

  // Show missing info warnings if present
  if (orderData.missingInfo && orderData.missingInfo.length > 0) {
    console.log(`\n${c.yellow}⚠️  Missing information detected:${c.reset}`);
    orderData.missingInfo.forEach((m) => {
      console.log(`${c.yellow}   ${m.field}: ${m.message}${c.reset}`);
    });
  }

  console.log(`\n${c.dim}Agent message: ${purchaseRes.data.agentMessage}${c.reset}`);
  console.log(`${c.dim}Agent instructions: ${purchaseRes.data.agentInstructions?.substring(0, 150)}...${c.reset}`);

  if (DRY_RUN) {
    header('🏁 DRY RUN COMPLETE');
    log('✅', 'Search + Purchase creation works. Skipping approval + checkout.');
    log('📝', `Order ${orderData.orderId} left as pending_approval.`);
    process.exit(0);
  }

  // ──────────────────────────────────────────────────────────────
  // STEP 4: POST /agent/orders/:id/approve — Approve the order
  // ──────────────────────────────────────────────────────────────
  header('Step 4: POST /agent/orders/:id/approve — Approve Order');

  log('✋', 'Simulating: User says "Yes, go ahead"');

  const approveRes = await api('POST', `/agent/orders/${orderData.orderId}/approve`, {
    user_id: userId,
  }, AGENT_TOKEN);

  log('✅', `Order approved! Status: ${approveRes.data.status}`);
  console.log(`\n${c.dim}Agent message: ${approveRes.data.agentMessage}${c.reset}`);
  console.log(`${c.dim}Agent instructions: ${approveRes.data.agentInstructions?.substring(0, 200)}...${c.reset}`);

  // ──────────────────────────────────────────────────────────────
  // STEP 5: Poll GET /agent/orders/:id — Wait for completion
  // ──────────────────────────────────────────────────────────────
  header('Step 5: Polling for checkout completion...');

  const MAX_POLLS = 30; // 30 * 10s = 5 minutes max wait
  const POLL_INTERVAL = 10000; // 10 seconds

  log('⏳', `Waiting 20s before first poll (checkout needs time to start)...`);
  await sleep(20000);

  for (let i = 0; i < MAX_POLLS; i++) {
    const statusRes = await api('GET', `/agent/orders/${orderData.orderId}`, null, AGENT_TOKEN);
    const status = statusRes.data.status;
    const elapsed = 20 + (i * 10);

    const statusEmoji = {
      approved: '🟡',
      processing: '🔄',
      purchasing: '🛒',
      confirmed: '✅',
      failed: '❌',
      cancelled: '🚫',
    };

    log(statusEmoji[status] || '❓', `[${elapsed}s] Status: ${status}`);

    if (status === 'confirmed') {
      header('🎉 CHECKOUT COMPLETE!');
      log('✅', `Order ${orderData.orderId} confirmed!`);
      log('📦', `Product: ${statusRes.data.product.title}`);
      log('💰', `Amount: $${statusRes.data.payment.amount}`);
      if (statusRes.data.tracking?.retailerOrderId) {
        log('🏷️', `Retailer order #: ${statusRes.data.tracking.retailerOrderId}`);
      }
      if (statusRes.data.tracking?.trackingUrl) {
        log('🔗', `Tracking: ${statusRes.data.tracking.trackingUrl}`);
      }
      console.log(`\n${c.dim}Agent message: ${statusRes.data.agentMessage}${c.reset}`);
      process.exit(0);
    }

    if (status === 'failed') {
      header('❌ CHECKOUT FAILED');
      log('❌', `Order ${orderData.orderId} failed`);
      console.log(`\n${c.dim}Agent message: ${statusRes.data.agentMessage}${c.reset}`);
      process.exit(1);
    }

    if (status === 'cancelled') {
      log('🚫', 'Order was cancelled');
      process.exit(1);
    }

    await sleep(POLL_INTERVAL);
  }

  header('⏰ TIMEOUT');
  log('⚠️', `Order ${orderData.orderId} still processing after ${20 + MAX_POLLS * 10}s`);
  log('💡', `Check manually: GET /agent/orders/${orderData.orderId}`);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════
main().catch((err) => {
  console.error(`\n${c.red}💥 Test failed: ${err.message}${c.reset}`);
  if (err.stack) console.error(`${c.dim}${err.stack}${c.reset}`);
  process.exit(1);
});

