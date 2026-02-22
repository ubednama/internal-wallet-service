import { Server } from 'http';
import { redisClient } from '@/lib/redis';
import { closeDatabaseConnection } from '@/lib/prisma';
import logger from '@/lib/logger';

export const setupGracefulShutdown = (server: Server): void => {
    const shutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down...`);

        server.close(async () => {
            logger.info('✓ HTTP server closed');
            await closeDatabaseConnection();

            try {
                await redisClient.quit();
                logger.info('✓ Redis connection closed');
            } catch (error) {
                logger.error('Error closing Redis', { error });
            }

            logger.info('✓ Shutdown complete');
            process.exit(0);
        });

        // Force shutdown after 30s
        setTimeout(() => {
            logger.error('✗ Forced shutdown after timeout');
            process.exit(1);
        }, 30_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};
