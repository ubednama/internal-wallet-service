import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { StatusCodes } from 'http-status-codes';
import logger from '@/lib/logger';
import { validateEnvironment, getPort } from '@/lib/env';
import { verifyDatabaseConnection } from '@/lib/prisma';
import { connectRedis } from '@/lib/redis';
import { setupGracefulShutdown } from '@/lib/shutdown';
import { requestLoggingMiddleware } from '@/middleware/logging';
import { responseEnvelopeMiddleware } from '@/middleware/response';
import appRoutes from '@/routes';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use(requestLoggingMiddleware);
app.use(responseEnvelopeMiddleware);

// Routes
app.use('/api', appRoutes);

// Health
app.get('/health', (_req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// 404 fallback
app.use((_req, res) => {
    res.status(StatusCodes.NOT_FOUND).json({
        status: 'FAILED',
        error: 'Route not found',
        timestamp: new Date().toISOString()
    });
});

const startServer = async () => {
    try {
        validateEnvironment();
        await connectRedis();
        await verifyDatabaseConnection();

        const port = getPort();
        const server = app.listen(port, () => {
            logger.info(`✓ Wallet Service listening on :${port}`);
        });

        setupGracefulShutdown(server);
    } catch (error) {
        logger.error('✗ Failed to start server', { error });
        process.exit(1);
    }
};

startServer();
