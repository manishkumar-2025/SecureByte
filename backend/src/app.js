const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const { env } = require('./config/env');
const { prisma } = require('./lib/prisma');
const { globalLimiter } = require('./middleware/rateLimiters');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

// Read once — package.json is static at runtime.
const PkgVersion = require('../package.json').version;

/** Small request logger (method, path, status, duration). */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/api/health' && env.nodeEnv === 'development') return; // reduce noise
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
}

async function healthHandler(req, res) {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        database: 'connected',
        databaseLatencyMs: Date.now() - startedAt,
        uptimeSeconds: Math.floor(process.uptime()),
        version: PkgVersion,
        time: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(503).json({ success: false, error: { code: 'DB_UNAVAILABLE', message: 'Service is up, but the database is not reachable.' } });
  }
}

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind one reverse proxy (needed for rate limiting)

  app.use(helmet()); // secure HTTP headers
  app.use(compression()); // gzip responses (helps slow campus Wi-Fi)
  app.use(
    cors({
      origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',').map((o) => o.trim()),
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    })
  );
  app.use(express.json({ limit: '16kb' })); // small bodies only — API takes no uploads
  app.use(requestLogger);
  app.use(globalLimiter);

  app.get('/api/health', healthHandler);
  app.use('/api', routes);

  // Web Command Center & Campus Dispatch Portal (accessible from browser)
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
