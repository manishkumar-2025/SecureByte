const { PrismaClient } = require('@prisma/client');

// Single shared PrismaClient instance (creating one per request would
// exhaust database connections).
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

module.exports = { prisma };
