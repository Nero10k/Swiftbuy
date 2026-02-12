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
app.get('/debug/search-test', async (req, res) => {
  const timings = {};
  const start = Date.now();
  
  try {
    // Test 1: Serper API directly
    const serperKey = process.env.SERPER_API_KEY;
    timings.serperKeySet = !!serperKey;
    
    if (serperKey) {
      const serperStart = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch('https://google.serper.dev/shopping', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ q: 'wireless headphones', gl: 'us', hl: 'en', num: 5 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        
        timings.serperStatus = response.status;
        timings.serperMs = Date.now() - serperStart;
        
        if (response.ok) {
          const data = await response.json();
          timings.serperResults = (data.shopping || []).length;
          timings.serperFirstTitle = data.shopping?.[0]?.title || 'none';
        } else {
          timings.serperError = await response.text();
        }
      } catch (e) {
        timings.serperMs = Date.now() - serperStart;
        timings.serperError = e.message;
      }
    }
    
    // Test 2: Full search service
    const searchStart = Date.now();
    try {
      const searchService = require('./services/search/search.service');
      const results = await searchService.search('headphones', {}, 3);
      timings.searchMs = Date.now() - searchStart;
      timings.searchResults = results.products.length;
      timings.searchSource = results.meta.source;
    } catch (e) {
      timings.searchMs = Date.now() - searchStart;
      timings.searchError = e.message;
      timings.searchStack = e.stack?.split('\n').slice(0, 3);
    }
    
    timings.totalMs = Date.now() - start;
    res.json({ success: true, timings });
  } catch (e) {
    timings.totalMs = Date.now() - start;
    res.json({ success: false, error: e.message, timings });
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

