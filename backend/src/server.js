const { createApp } = require('./app');
const { env } = require('./config/env');
const { prisma } = require('./lib/prisma');
const { recoverPendingEscalations } = require('./services/escalationService');

const app = createApp();

let escalationSweepInterval = null;

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log('──────────────────────────────────────────────');
  console.log('  SecureByte API');
  console.log(`  Listening on http://localhost:${env.port}  (${env.nodeEnv})`);
  console.log(`  Health check:  http://localhost:${env.port}/api/health`);
  console.log('──────────────────────────────────────────────');

  // Durable recovery: recover unacknowledged SOS escalations across server restarts
  recoverPendingEscalations().then((recovered) => {
    if (recovered && recovered.length > 0) {
      console.log(`[escalation-recovery] Recovered ${recovered.length} pending SOS escalations on startup.`);
    }
  }).catch((err) => {
    console.error('[escalation-recovery] Startup recovery error:', err.message);
  });

  // Periodic background escalation sweep (every 30 seconds)
  escalationSweepInterval = setInterval(() => {
    recoverPendingEscalations().catch((err) => {
      console.error('[escalation-sweep] Background sweep error:', err.message);
    });
  }, 30_000);
  if (escalationSweepInterval.unref) escalationSweepInterval.unref();
});

// Graceful shutdown: stop accepting new requests, finish pending ones,
// close the database pool, then exit.
async function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down…`);
  if (escalationSweepInterval) clearInterval(escalationSweepInterval);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard exit if hung
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
