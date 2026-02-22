import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '@/lib/logger';
import { RATE_LIMITS } from '@/constants';

export const transactionLimiter = rateLimit({
    windowMs: RATE_LIMITS.TRANSACTION.windowMs,
    max: RATE_LIMITS.TRANSACTION.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health',
    handler: (req: Request, res: Response, _next: NextFunction, options) => {
        logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
        res.status(options.statusCode).json({
            status: 'RATE_LIMITED',
            error: options.message
        });
    }
});

export const balanceQueryLimiter = rateLimit({
    windowMs: RATE_LIMITS.BALANCE_QUERY.windowMs,
    max: RATE_LIMITS.BALANCE_QUERY.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === '/health'
});
