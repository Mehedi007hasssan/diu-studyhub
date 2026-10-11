try {
  process.loadEnvFile();
} catch {}

const { PrismaClient } = require('@prisma/client');

// Serverless-friendly Prisma Client singleton to avoid connection exhaustion on Vercel
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
};

const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
