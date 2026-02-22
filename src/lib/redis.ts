import { Redis, RedisOptions } from 'ioredis';
import logger from '@/lib/logger';

const redisConfig: RedisOptions = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 50, 2000)
};

export const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', redisConfig);

redisClient.on('connect', () => logger.info('✓ Connected to Redis'));
redisClient.on('error', (err) => logger.error('✗ Redis error', { error: err.message }));
redisClient.on('reconnecting', () => logger.warn('Reconnecting to Redis...'));

export const connectRedis = async (): Promise<void> => {
    await redisClient.ping();
    logger.info('✓ Redis ping successful');
};
