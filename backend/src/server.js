const { createApp } = require('./app');
const { env } = require('./config/env');
const { prisma } = require('./lib/prisma');

const app = createApp();

const server = app.listen(env.port, '0.0.0.0', () => {
  console.log('──────────────────────────────────────────────');
  console.log('  SecureByte API');
  console.log(`  Listening on http://localhost:${env.port}  (${env.nodeEnv})`);
  console.log(`  Health check:  http://localhost:${env.port}/api/health`);
  console.log('──────────────────────────────────────────────');
});

// Graceful shutdown: stop accepting new requests, finish pending ones,
// close the database pool, then exit.
async function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down…`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard exit if hung
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
