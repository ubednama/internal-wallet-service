import logger from '@/lib/logger';

export const validateEnvironment = (): void => {
    const required = ['DATABASE_URL', 'REDIS_URL'];
    const missing = required.filter((v) => !process.env[v]);

    if (missing.length > 0) {
        const msg = `Missing required environment variables: ${missing.join(', ')}`;
        logger.error(msg);
        throw new Error(msg);
    }

    logger.info('✓ Environment validation passed', {
        port: process.env.PORT || 3000,
        nodeEnv: process.env.NODE_ENV || 'development'
    });
};

export const getPort = (): number => parseInt(process.env.PORT || '3000', 10);
