import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { WalletService, getTreasuryId } from '@/services/wallet.service';
import { transactionSchema } from '@/validators/transaction.validator';
import { checkAndReserveIdempotencyKey, saveIdempotencyResult } from '@/utils/idempotency';
import { errorResponse } from '@/middleware/response';
import { AppError } from '@/errors/app-error';
import logger from '@/lib/logger';

export class WalletController {
    static async processTransaction(req: Request, res: Response): Promise<void> {
        const { id: requestId } = req;
        const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

        if (!idempotencyKey) {
            res.status(StatusCodes.BAD_REQUEST).json(errorResponse('Idempotency-Key header is required'));
            return;
        }

        const cached = await checkAndReserveIdempotencyKey(idempotencyKey);

        if (cached) {
            if (cached.status === 'PROCESSING') {
                res.status(StatusCodes.CONFLICT).json(errorResponse('Transaction is currently processing. Please retry later.'));
                return;
            }
            res.status(StatusCodes.OK).json({ ...cached, _cached: true });
            return;
        }

        try {
            const parsed = transactionSchema.safeParse(req.body);

            if (!parsed.success) {
                await saveIdempotencyResult(idempotencyKey, { status: 'FAILED', error: 'Validation failed' });
                res.status(StatusCodes.BAD_REQUEST).json(
                    errorResponse({ message: 'Validation failed', details: parsed.error.issues })
                );
                return;
            }

            const { userId, type, amount, assetSymbol } = parsed.data;
            const treasuryId = await getTreasuryId();

            const fromUserId = (type === 'TOP_UP' || type === 'BONUS') ? treasuryId : userId;
            const toUserId = (type === 'TOP_UP' || type === 'BONUS') ? userId : treasuryId;

            logger.debug('Routing transaction', { requestId, type, fromUserId, toUserId, amount, assetSymbol });

            const result = await WalletService.executeTransaction(
                idempotencyKey, fromUserId, toUserId, assetSymbol, amount, type
            );

            await saveIdempotencyResult(idempotencyKey, {
                status: 'SUCCESS',
                txId: result.txId,
                balance: result.balance
            });

            logger.info('Transaction completed', { requestId, txId: result.txId, type });
            res.status(StatusCodes.OK).json(result);

        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Internal Server Error';
            logger.error('Transaction failed', { requestId, idempotencyKey, error: message });

            await saveIdempotencyResult(idempotencyKey, { status: 'FAILED', error: message });

            const isClientError = message.includes('not found') || message.includes('Insufficient funds');
            res.status(isClientError ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR)
                .json({ status: 'FAILED', error: message });
        }
    }

    static async getBalance(req: Request, res: Response): Promise<void> {
        try {
            const userId = req.params.userId as string;
            const assetSymbol = ((req.query.asset as string) || 'GOLD').toUpperCase();

            if (!userId.trim()) {
                res.status(StatusCodes.BAD_REQUEST).json(errorResponse('userId is required'));
                return;
            }

            const balance = await WalletService.getBalance(userId, assetSymbol);
            res.status(StatusCodes.OK).json({ userId, assetSymbol, balance });

        } catch (error: unknown) {
            const status = error instanceof AppError ? error.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
            const message = error instanceof Error ? error.message : 'Internal Server Error';
            res.status(status).json(errorResponse(message));
        }
    }

    static async getLedger(req: Request, res: Response): Promise<void> {
        const { id: requestId } = req;
        try {
            const userId = req.params.userId as string;
            const assetSymbol = req.query.asset as string | undefined;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            if (!userId.trim()) {
                res.status(StatusCodes.BAD_REQUEST).json(errorResponse('userId is required'));
                return;
            }

            logger.info('Fetching ledger', { requestId, userId, assetSymbol, limit, offset });
            const result = await WalletService.getLedger(userId, { assetSymbol, limit, offset });
            res.status(StatusCodes.OK).json(result);

        } catch (error: unknown) {
            const status = error instanceof AppError ? error.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
            const message = error instanceof Error ? error.message : 'Internal Server Error';
            logger.error('Error fetching ledger', { requestId, error: message });
            res.status(status).json(errorResponse(message));
        }
    }

    static async getTransactionHistory(req: Request, res: Response): Promise<void> {
        const { id: requestId } = req;

        try {
            const userId = req.params.userId as string;
            const type = req.query.type as string | undefined;
            const assetSymbol = req.query.asset as string | undefined;
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;
            const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
            const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

            if (!userId.trim()) {
                res.status(StatusCodes.BAD_REQUEST).json(errorResponse('userId is required'));
                return;
            }
            if (startDate && isNaN(startDate.getTime())) {
                res.status(StatusCodes.BAD_REQUEST).json(errorResponse('Invalid startDate format'));
                return;
            }
            if (endDate && isNaN(endDate.getTime())) {
                res.status(StatusCodes.BAD_REQUEST).json(errorResponse('Invalid endDate format'));
                return;
            }

            logger.info('Fetching transaction history', { requestId, userId, type, assetSymbol, limit, offset });

            const result = await WalletService.getTransactionHistory(userId, {
                type: type as any,
                assetSymbol,
                startDate,
                endDate,
                limit,
                offset
            });

            res.status(StatusCodes.OK).json(result);

        } catch (error: unknown) {
            const status = error instanceof AppError ? error.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
            const message = error instanceof Error ? error.message : 'Internal Server Error';
            logger.error('Error fetching history', { requestId, error: message });
            res.status(status).json(errorResponse(message));
        }
    }

    static async getTransactionById(req: Request, res: Response): Promise<void> {
        const { id: requestId } = req;

        try {
            const transactionId = req.params.transactionId as string;

            if (!transactionId.trim()) {
                res.status(StatusCodes.BAD_REQUEST).json(errorResponse('transactionId is required'));
                return;
            }

            logger.debug('Fetching transaction', { requestId, transactionId });

            const transaction = await WalletService.getTransactionById(transactionId);
            res.status(StatusCodes.OK).json(transaction);

        } catch (error: unknown) {
            const status = error instanceof AppError ? error.statusCode : StatusCodes.INTERNAL_SERVER_ERROR;
            const message = error instanceof Error ? error.message : 'Internal Server Error';
            logger.error('Error fetching transaction', { requestId, error: message });
            res.status(status).json(errorResponse(message));
        }
    }
}
