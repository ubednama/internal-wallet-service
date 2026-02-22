import { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T = unknown> {
    status: 'SUCCESS' | 'FAILED' | 'RATE_LIMITED';
    data?: T;
    error?: string | Record<string, unknown>;
    timestamp: string;
    requestId?: string;
}

export const responseEnvelopeMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const originalJson = res.json.bind(res);

    res.json = function (data: unknown): Response {
        if (data && typeof data === 'object' && ('status' in data || 'error' in data)) {
            return originalJson(data);
        }

        const envelope: ApiResponse = {
            status: res.statusCode >= 400 ? 'FAILED' : 'SUCCESS',
            data: data as Record<string, unknown>,
            timestamp: new Date().toISOString(),
            requestId: req.id
        };

        return originalJson(envelope);
    };

    next();
};

export const errorResponse = (error: string | Record<string, unknown>): ApiResponse => ({
    status: 'FAILED',
    error,
    timestamp: new Date().toISOString()
});
