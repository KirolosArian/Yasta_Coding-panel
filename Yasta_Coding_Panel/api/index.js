/**
 * Yasta_Coding Panel - Core Express Application & Serverless Entrypoint
 * Compatible with Vercel Serverless Functions and standalone Node.js environments.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectToDatabase } = require('./_db');
const User = require('../models/User');
const Setting = require('../models/Setting');

// Route modules
const authRoutes = require('./routes/auth');
const keysRoutes = require('./routes/keys');
const usersRoutes = require('./routes/users');
const systemRoutes = require('./routes/system');
const validateRoutes = require('./routes/validate');
const logsRoutes = require('./routes/logs');

const app = express();

// Enable trust proxy for accurate IP identification behind Vercel / reverse proxies
app.set('trust proxy', 1);

// Standard Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-access-token']
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Lightweight in-memory rate limiter for sensitive endpoints
const rateLimitMap = new Map();
function rateLimiter(windowMs = 60000, maxRequests = 100) {
  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl || req.path}`;
    const now = Date.now();

    const record = rateLimitMap.get(key) || { count: 0, resetTime: now + windowMs };
    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count++;
    }

    rateLimitMap.set(key, record);

    // Clean up old entries periodically
    if (rateLimitMap.size > 10000) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetTime) rateLimitMap.delete(k);
      }
    }

    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'TooManyRequests',
        message: 'Rate limit exceeded. Please cool down before retrying.'
      });
    }
    next();
  };
}

// Serve public static files if running standalone
app.use(express.static(path.join(__dirname, '../public')));

// Database pre-connect middleware for all /api requests
app.use('/api', async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error('[Yasta_Coding DB Connection Error]:', err.message);
    return res.status(503).json({
      success: false,
      error: 'DatabaseUnavailable',
      message: 'Failed to establish database connection.'
    });
  }
});

// API Root / Health Check
app.get(['/api', '/api/health'], (req, res) => {
  res.json({
    success: true,
    service: 'Yasta_Coding Panel API',
    version: '1.0.0',
    status: 'operational',
    timestamp: new Date().toISOString()
  });
});

// Register API Routes
app.use('/api/auth', rateLimiter(60000, 40), authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/validate', rateLimiter(60000, 120), validateRoutes);
app.use('/api/logs', logsRoutes);

// Bootstrap Initial Admin Account and Settings
async function bootstrapSystem() {
  try {
    await connectToDatabase();
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount === 0) {
      const defaultUsername = (process.env.ADMIN_USERNAME || 'admin').toLowerCase().trim();
      const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123456';
      const hashedPassword = await User.hashPassword(defaultPassword);

      await User.create({
        username: defaultUsername,
        password: hashedPassword,
        role: 'admin',
        credits: 999999,
        status: 'active'
      });
      console.log(`[Yasta_Coding] Initial administrator account created: ${defaultUsername}`);
    }

    await Setting.getSettings();
  } catch (err) {
    console.error('[Yasta_Coding Bootstrap Error]:', err.message);
  }
}

// Global 404 Handler for /api
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'NotFound',
    message: `API endpoint '${req.originalUrl}' not found.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Yasta_Coding Unhandled Exception]:', err);
  res.status(err.status || 500).json({
    success: false,
    error: 'InternalServerError',
    message: err.message || 'An unexpected server error occurred.'
  });
});

// Automatic bootstrap when loaded
bootstrapSystem().catch(console.error);

// Standalone server execution
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`[Yasta_Coding Panel] Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
