#!/usr/bin/env node

/**
 * Dry-Run Checkout Test (Hybrid Phased Engine)
 *
 * Tests the OPTIMIZED checkout automation on a retailer website.
 * Uses 3-phase approach:
 *   Phase 1: Computer Use → Add to cart (LLM, ~3-5 turns)
 *   Phase 2: DOM Fast-Fill → Shipping & payment (~3 seconds, 0 LLM)
 *   Phase 3: Computer Use → Review & complete (LLM, ~2-3 turns)
 *
 * Stops before clicking "Place Order" in dry-run mode. No payment is made.
 *
 * Usage:
 *   node test-checkout-dryrun.js [--url "https://..."] [--headless] [--query "search terms"]
 *
 * Examples:
 *   # Direct URL test (fastest)
 *   node test-checkout-dryrun.js --url "https://www.allbirds.com/products/mens-tree-runners"
 *
 *   # Search first, then checkout the top result
 *   node test-checkout-dryrun.js --query "Sony WH-1000XM5 headphones"
 *
 *   # Run headless (no visible browser)
 *   node test-checkout-dryrun.js --url "https://www.allbirds.com/products/mens-tree-runners" --headless
 */

require('dotenv').config();

const mongoose = require('mongoose');
const config = require('./src/config');
const checkoutAutomation = require('./src/services/purchase/checkout.automation');
const User = require('./src/models/User');
const logger = require('./src/utils/logger');
const { generateId } = require('./src/utils/helpers');

// ─── Parse CLI args ────────────────────────────────────────────────
const args = process.argv.slice(2);
const urlIdx = args.indexOf('--url');
const queryIdx = args.indexOf('--query');
const PRODUCT_URL = urlIdx !== -1 ? args[urlIdx + 1] : null;
const SEARCH_QUERY = queryIdx !== -1 ? args[queryIdx + 1] : null;
const HEADLESS = args.includes('--headless');

// ─── Colors ────────────────────────────────────────────────────────
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

function log(emoji, msg) {
  console.log(`${emoji}  ${msg}`);
}

function header(msg) {
  console.log(`\n${c.bright}${c.cyan}═══ ${msg} ═══${c.reset}\n`);
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n${c.bright}${c.magenta}┌────────────────────────────────────────────────┐${c.reset}`);
  console.log(`${c.bright}${c.magenta}│  Swiftbuy Dry-Run Checkout Test                │${c.reset}`);
  console.log(`${c.bright}${c.magenta}│  🧪 No real payment — stops before Place Order │${c.reset}`);
  console.log(`${c.bright}${c.magenta}└────────────────────────────────────────────────┘${c.reset}`);

  if (!PRODUCT_URL && !SEARCH_QUERY) {
    console.log(`\n${c.red}Usage:${c.reset}`);
    console.log(`  node test-checkout-dryrun.js --url "https://www.example.com/product"`);
    console.log(`  node test-checkout-dryrun.js --query "Sony headphones"`);
    console.log(`\n${c.dim}Options:${c.reset}`);
    console.log(`  --url <url>      Direct product URL to test checkout on`);
    console.log(`  --query <query>  Search first, then checkout the top result`);
    console.log(`  --headless       Run browser in headless mode (default: visible)`);
    process.exit(1);
  }

  // ── Check Anthropic key ──────────────────────────────────────────
  if (!config.checkout.anthropicApiKey) {
    console.log(`\n${c.red}⛔ ANTHROPIC_API_KEY not set in .env${c.reset}`);
    process.exit(1);
  }

  if (!checkoutAutomation.isReady()) {
    console.log(`\n${c.red}⛔ Checkout engine not ready (API key invalid?)${c.reset}`);
    process.exit(1);
  }

  log('✅', `Anthropic API key: set`);
  log('🖥️', `Browser mode: ${HEADLESS ? 'headless' : 'VISIBLE (you can watch!)'}`);

  // ── Override headless setting for this test ──────────────────────
  config.checkout.headless = HEADLESS;

  // ── Connect to MongoDB ──────────────────────────────────────────
  header('Connecting to MongoDB');
  await mongoose.connect(config.mongodb.uri);
  log('✅', 'Connected to MongoDB');

  // ── Get the test user ───────────────────────────────────────────
  const testEmail = process.env.TEST_USER_EMAIL;
  let user;

  if (testEmail) {
    user = await User.findOne({ email: testEmail });
  }
  if (!user) {
    // Fallback: find any user with a shipping address
    user = await User.findOne({ 'shippingAddresses.0': { $exists: true } });
  }
  if (!user) {
    console.log(`\n${c.red}⛔ No user with shipping address found in DB.${c.reset}`);
    console.log(`Set TEST_USER_EMAIL in .env or create a user with an address.`);
    process.exit(1);
  }

  const address = user.shippingAddresses.find((a) => a.isDefault) || user.shippingAddresses[0];
  log('👤', `User: ${user.name} (${user.email})`);
  log('📍', `Shipping: ${address.street}, ${address.city}, ${address.state} ${address.zipCode}`);

  // ── Resolve product URL ─────────────────────────────────────────
  let productUrl = PRODUCT_URL;
  let productTitle = 'Test Product';
  let productPrice = 0;

  if (!productUrl && SEARCH_QUERY) {
    header(`Searching: "${SEARCH_QUERY}"`);

    // Use the search service to find products
    const searchService = require('./src/services/search/search.service');
    const results = await searchService.search({ query: SEARCH_QUERY, limit: 5 });

    if (!results.products || results.products.length === 0) {
      console.log(`\n${c.red}⛔ No products found for "${SEARCH_QUERY}".${c.reset}`);
      process.exit(1);
    }

    // Show results and pick the first one with a URL
    results.products.slice(0, 3).forEach((p, i) => {
      const hasUrl = p.url && !p.url.includes('google.com/search');
      log(`  ${i + 1}.`, `${p.title?.substring(0, 60)} — $${p.price} from ${p.retailer} ${hasUrl ? '✅' : '❌ no direct URL'}`);
    });

    const selected = results.products.find((p) => p.url && !p.url.includes('google.com/search')) || results.products[0];
    productUrl = selected.url;
    productTitle = selected.title || 'Test Product';
    productPrice = selected.price || 0;

    log('👆', `Selected: "${productTitle.substring(0, 60)}" at $${productPrice}`);
    log('🔗', `URL: ${productUrl}`);
  } else {
    // URL provided directly — extract domain info
    try {
      const domain = new URL(productUrl).hostname;
      productTitle = `Product from ${domain}`;
      productPrice = 99.99; // Placeholder since we don't know the price
    } catch {
      console.log(`\n${c.red}⛔ Invalid URL: ${productUrl}${c.reset}`);
      process.exit(1);
    }
  }

  if (!productUrl) {
    console.log(`\n${c.red}⛔ No product URL available.${c.reset}`);
    process.exit(1);
  }

  // ── Build the order and context ─────────────────────────────────
  header('Starting Dry-Run Checkout');

  const fakeOrder = {
    orderId: generateId('dryrun'),
    product: {
      title: productTitle,
      price: productPrice,
      url: productUrl,
      retailer: new URL(productUrl).hostname.replace('www.', ''),
    },
  };

  const testCard = {
    number: '4111111111111111',
    cvv: '123',
    expiry: '12/2027',
    expiryMonth: '12',
    expiryYear: '2027',
  };

  const shippingAddress = {
    fullName: address.fullName || user.name,
    street: address.street,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    country: address.country || 'US',
    phone: address.phone || user.profile?.phone || '555-000-0000',
  };

  const userContext = {
    email: user.email,
    name: user.name,
    phone: shippingAddress.phone,
    profile: {
      sizes: user.profile?.sizes || {},
      gender: user.profile?.gender || '',
      notes: user.profile?.notes || '',
    },
  };

  log('📦', `Order: ${fakeOrder.orderId}`);
  log('🛒', `Product: ${productTitle.substring(0, 60)}`);
  log('💰', `Price: $${productPrice}`);
  log('🔗', `URL: ${productUrl}`);
  log('💳', `Card: 4111 **** **** 1111 (test Visa)`);
  log('📍', `Ship to: ${shippingAddress.fullName}, ${shippingAddress.city}, ${shippingAddress.state}`);

  console.log(`\n${c.yellow}🧪 DRY-RUN: Browser will navigate the full checkout but STOP before "Place Order"${c.reset}`);
  console.log(`${c.dim}   Timeout: ${config.checkout.timeoutMs / 1000}s | Max turns: ${config.checkout.maxSteps}${c.reset}\n`);

  // ── Run the checkout engine ─────────────────────────────────────
  const startTime = Date.now();

  try {
    const result = await checkoutAutomation.executeCheckout(
      fakeOrder,
      testCard,
      shippingAddress,
      userContext,
      { dryRun: true }
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      header('🧪 DRY-RUN COMPLETE!');
      log('✅', `Checkout flow navigated successfully in ${elapsed}s`);
      log('🔄', `LLM calls: ${result.llmCalls}`);
      log('📝', `Steps recorded: ${result.recordedSteps?.length || 0}`);
      log('🔗', `Final page: ${result.confirmationUrl || 'N/A'}`);
      if (result.retailerOrderId) {
        log('🏷️', `Order # (if any): ${result.retailerOrderId}`);
      }
      log('💡', `Used saved flow: ${result.usedSavedFlow ? 'yes' : 'no'}`);

      console.log(`\n${c.green}${c.bright}The checkout engine successfully navigated to the final submit page!${c.reset}`);
      console.log(`${c.green}With a real payment card, this would complete the purchase.${c.reset}`);
    } else {
      header('⚠️  DRY-RUN STOPPED');
      log('⚠️', `Checkout did not reach completion: ${result.error}`);
      log('🔄', `LLM calls used: ${result.llmCalls}`);
      log('📝', `Steps completed: ${result.recordedSteps?.length || 0}`);
      log('⏱️', `Time: ${elapsed}s`);
    }
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    header('❌ DRY-RUN FAILED');
    log('❌', `Error: ${error.message}`);
    log('⏱️', `Time: ${elapsed}s`);
    if (error.stack) {
      console.log(`\n${c.dim}${error.stack}${c.reset}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════
main().catch((err) => {
  console.error(`\n${c.red}💥 Test failed: ${err.message}${c.reset}`);
  if (err.stack) console.error(`${c.dim}${err.stack}${c.reset}`);
  process.exit(1);
});

