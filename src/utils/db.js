import { PrismaClient } from '@prisma/client';

// A single shared Prisma client for the whole app — avoids exhausting
// database connections when this module is imported in multiple routes.
export const prisma = new PrismaClient();
