import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import logger from '@/lib/logger';

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

if (!connectionString) {
    throw new Error('DATABASE_URL or DIRECT_URL must be set');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

export const verifyDatabaseConnection = async (): Promise<void> => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        logger.info('✓ Database connection verified');
    } catch (error) {
        logger.error('✗ Database connection failed', { error });
        throw new Error('Failed to connect to database');
    }
};

export const closeDatabaseConnection = async (): Promise<void> => {
    try {
        await prisma.$disconnect();
        logger.info('✓ Database connection closed');
    } catch (error) {
        logger.error('Error disconnecting from database', { error });
    }
};

export default prisma;
