import { redisClient } from '@/lib/redis';
import logger from '@/lib/logger';
import { IDEMPOTENCY } from '@/constants';

type CachedResponse =
    | { status: 'PROCESSING'; message?: string }
    | { status: 'SUCCESS'; txId: string; balance: string }
    | { status: 'FAILED'; error: string; details?: unknown };

export const checkAndReserveIdempotencyKey = async (key: string): Promise<CachedResponse | null> => {
    const result = await redisClient.get(`idempotency:${key}`);

    if (result) {
        const parsed = JSON.parse(result) as CachedResponse;
        logger.debug('Idempotency key found', { key, status: parsed.status });
        return parsed;
    }

    const reserved = await redisClient.set(
        `idempotency:${key}`,
        JSON.stringify({ status: 'PROCESSING' } satisfies CachedResponse),
        'EX', IDEMPOTENCY.PROCESSING_TTL,
        'NX'
    );

    if (reserved !== 'OK') {
        logger.debug('Key already being processed', { key });
        return { status: 'PROCESSING', message: 'A concurrent request is already processing this key.' };
    }

    logger.debug('Idempotency key reserved', { key });
    return null;
};

export const saveIdempotencyResult = async (key: string, response: CachedResponse): Promise<void> => {
    await redisClient.set(
        `idempotency:${key}`,
        JSON.stringify(response),
        'EX', IDEMPOTENCY.CACHE_TTL
    );
    logger.debug('Idempotency result cached', { key, status: response.status });
};
