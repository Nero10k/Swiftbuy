const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { apiLimiter } = require('./api/middleware/rateLimiter');
const { errorHandler } = require('./api/middleware/errorHandler');

// Import routes
const authRoutes = require('./api/routes/auth.routes');
const agentRoutes = require('./api/routes/agent.routes');
const userRoutes = require('./api/routes/user.routes');
const walletRoutes = require('./api/routes/wallet.routes');
const chatRoutes = require('./api/routes/chat.routes');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use(morgan('combined'));

// Rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (req, res) => {
  const config = require('./config');
  res.json({
    status: 'ok',
    service: 'swiftbuy',
    timestamp: new Date().toISOString(),
    environment: config.env,
    search: {
      serperConfigured: !!process.env.SERPER_API_KEY,
      playwrightEnabled: config.env === 'development',
    },
  });
});

// Skill.md — public endpoint for AI agents to read
app.get('/skill.md', (req, res) => {
  const skillPath = path.join(__dirname, 'skill.md');
  let skillContent = fs.readFileSync(skillPath, 'utf-8');

  // Replace base URL placeholder with the actual URL
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const baseUrl = `${protocol}://${host}`;
  skillContent = skillContent.replace(/\{\{BASE_URL\}\}/g, baseUrl);

  res.set('Content-Type', 'text/markdown; charset=utf-8');
  res.send(skillContent);
});

// Debug: test search (temporary — remove after debugging)
app.get('/debug/test1', async (req, res) => {
  // Step 1: Just test if outbound HTTP works at all
  const start = Date.now();
  try {
    const resp = await fetch('https://httpbin.org/get', { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    res.json({ ok: true, ms: Date.now() - start, ip: data.origin });
  } catch (e) {
    res.json({ ok: false, ms: Date.now() - start, error: e.message });
  }
});

app.get('/debug/test2', async (req, res) => {
  // Step 2: Test Serper API directly
  const start = Date.now();
  const key = process.env.SERPER_API_KEY;
  if (!key) return res.json({ ok: false, error: 'No SERPER_API_KEY' });
  
  try {
    const resp = await fetch('https://google.serper.dev/shopping', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'headphones', gl: 'us', hl: 'en', num: 3 }),
      signal: AbortSignal.timeout(10000),
    });
    const ms = Date.now() - start;
    if (!resp.ok) {
      const errText = await resp.text();
      return res.json({ ok: false, ms, status: resp.status, error: errText });
    }
    const data = await resp.json();
    res.json({ ok: true, ms, results: (data.shopping || []).length, first: data.shopping?.[0]?.title });
  } catch (e) {
    res.json({ ok: false, ms: Date.now() - start, error: e.message });
  }
});

app.get('/debug/test3', async (req, res) => {
  // Step 3: Test full search pipeline
  const start = Date.now();
  try {
    const searchService = require('./services/search/search.service');
    const results = await searchService.search('headphones', {}, 3);
    res.json({ ok: true, ms: Date.now() - start, count: results.products.length, source: results.meta.source });
  } catch (e) {
    res.json({ ok: false, ms: Date.now() - start, error: e.message, stack: e.stack?.split('\n').slice(0, 5) });
  }
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/agent', agentRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/wallet', walletRoutes);
app.use('/api/v1/chat', chatRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;

