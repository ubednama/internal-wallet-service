import { Request, Response, NextFunction } from 'express';
import logger from '@/lib/logger';

export const requestLoggingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    req.id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    req.startTime = Date.now();

    logger.info('→ Request', {
        requestId: req.id,
        method: req.method,
        path: req.path,
        ip: req.ip
    });

    const originalJson = res.json.bind(res);
    res.json = function (body: unknown): Response {
        logger.info('← Response', {
            requestId: req.id,
            statusCode: res.statusCode,
            durationMs: Date.now() - req.startTime
        });
        return originalJson(body);
    };

    next();
};
