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
  res.json({
    status: 'ok',
    service: 'swiftbuy',
    timestamp: new Date().toISOString(),
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

