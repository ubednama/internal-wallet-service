import { Prisma } from '@prisma/client';
import { TransactionType } from '@/types/enums';
import { TRANSACTION_LIMITS, SYSTEM_USERS } from '@/constants';
import { NotFoundError, ValidationError } from '@/errors/app-error';
import logger from '@/lib/logger';
import prisma from '@/lib/prisma';

let treasuryId: string | null = null;

export async function getTreasuryId(): Promise<string> {
    if (treasuryId) return treasuryId;
    const treasury = await prisma.user.findUnique({
        where: { email: SYSTEM_USERS.TREASURY_EMAIL }
    });
    if (!treasury) throw new Error('System treasury account not found. Run seed.sql first.');
    treasuryId = treasury.id;
    return treasury.id;
}

const RETRYABLE_PG_CODES = new Set(['40P01', '55P03']);

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error: unknown) {
            const pgCode = (error as any)?.code as string | undefined;
            const isRetryable = pgCode && RETRYABLE_PG_CODES.has(pgCode);
            if (isRetryable && attempt < maxAttempts) {
                const delayMs = Math.pow(2, attempt) * 100; // 200 ms, 400 ms
                logger.warn('Retryable DB error — retrying', { pgCode, attempt, delayMs });
                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retry attempts exceeded');
}

// WalletService
export class WalletService {
    static async executeTransaction(
        idempotencyKey: string,
        fromUserId: string,
        toUserId: string,
        assetSymbol: string,
        amount: number,
        type: TransactionType
    ): Promise<{ status: string; txId: string; balance: string }> {
        if (amount <= 0 || !Number.isFinite(amount)) {
            throw new ValidationError('Amount must be a positive finite number', { amount });
        }
        if (amount > TRANSACTION_LIMITS.MAX_AMOUNT) {
            throw new ValidationError(`Amount exceeds maximum (${TRANSACTION_LIMITS.MAX_AMOUNT})`, { amount });
        }

        const asset = await prisma.asset.findUnique({ where: { symbol: assetSymbol } });
        if (!asset) throw new NotFoundError(`Asset ${assetSymbol} not found`, { assetSymbol });

        logger.debug('Starting transaction', { idempotencyKey, type, amount, assetSymbol, fromUserId, toUserId });

        return withRetry(() =>
            prisma.$transaction(async (tx: Prisma.TransactionClient) => {
                // Lock timeout: fail fast rather than hang
                await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;

                // DB-level idempotency fallback
                const existing = await tx.transaction.findUnique({
                    where: { idempotency_key: idempotencyKey }
                });
                if (existing) {
                    logger.info('Duplicate (DB level)', { idempotencyKey, txId: existing.id });

                    // On duplicate, we ideally fetch the latest balance, but as a fallback DB level return:
                    return { status: 'SUCCESS', txId: existing.id, balance: '0' };
                }

                // Acquire row locks in sorted order (deadlock prevention)
                const [lockA, lockB] = [fromUserId, toUserId].sort();
                await tx.$executeRaw`
                    SELECT id FROM wallets
                    WHERE user_id IN (${lockA}::uuid, ${lockB}::uuid)
                      AND asset_id = ${asset.id}::uuid
                    FOR UPDATE
                `;

                const fromWallet = await tx.wallet.findUnique({
                    where: { user_id_asset_id: { user_id: fromUserId, asset_id: asset.id } }
                });
                const toWallet = await tx.wallet.findUnique({
                    where: { user_id_asset_id: { user_id: toUserId, asset_id: asset.id } }
                });

                if (!fromWallet) throw new NotFoundError(`Sender wallet not found for ${fromUserId} / ${assetSymbol}`, { fromUserId, assetSymbol });
                if (!toWallet) throw new NotFoundError(`Receiver wallet not found for ${toUserId} / ${assetSymbol}`, { toUserId, assetSymbol });

                const currentBalance = Number(fromWallet.balance);
                if (currentBalance < 0) throw new Error(`Wallet balance corrupted for ${fromUserId}`);
                if (currentBalance < amount) throw new Error('Insufficient funds.');

                const newFromBalance = currentBalance - amount;
                const newToBalance = Number(toWallet.balance) + amount;

                // Update cached balances
                await tx.wallet.update({ where: { id: fromWallet.id }, data: { balance: newFromBalance } });
                await tx.wallet.update({ where: { id: toWallet.id }, data: { balance: newToBalance } });

                // Create transaction record
                const savedTx = await tx.transaction.create({
                    data: {
                        idempotency_key: idempotencyKey,
                        from_wallet_id: fromWallet.id,
                        to_wallet_id: toWallet.id,
                        amount,
                        type,
                        status: 'SUCCESS'
                    }
                });

                // Double-entry ledger
                await tx.ledgerEntry.createMany({
                    data: [
                        {
                            transaction_id: savedTx.id,
                            wallet_id: fromWallet.id,
                            entry_type: 'DEBIT',
                            amount,
                            balance_after: newFromBalance
                        },
                        {
                            transaction_id: savedTx.id,
                            wallet_id: toWallet.id,
                            entry_type: 'CREDIT',
                            amount,
                            balance_after: newToBalance
                        }
                    ]
                });

                logger.info('Transaction committed', { idempotencyKey, txId: savedTx.id, type, amount });

                const userBalance = (type === 'TOP_UP' || type === 'BONUS') ? newToBalance : newFromBalance;

                return {
                    status: 'SUCCESS',
                    txId: savedTx.id,
                    balance: userBalance.toString()
                };
            })
        );
    }

    static async getBalance(userId: string, assetSymbol: string): Promise<number> {
        const asset = await prisma.asset.findUnique({ where: { symbol: assetSymbol } });
        if (!asset) throw new NotFoundError(`Asset ${assetSymbol} not found`, { assetSymbol });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundError(`User ${userId} not found`, { userId });

        const wallet = await prisma.wallet.findUnique({
            where: { user_id_asset_id: { user_id: userId, asset_id: asset.id } }
        });
        if (!wallet) throw new NotFoundError(`No ${assetSymbol} wallet found for user ${userId}`, { userId, assetSymbol });

        const balance = Number(wallet.balance);
        if (balance < 0) logger.error('Negative balance detected', { userId, assetSymbol, balance });
        return balance;
    }

    static async getLedger(
        userId: string,
        options: { assetSymbol?: string; limit?: number; offset?: number } = {}
    ) {
        const { assetSymbol, limit = 50, offset = 0 } = options;

        if (limit < 1 || limit > 500) throw new ValidationError('Limit must be between 1 and 500', { limit });
        if (offset < 0) throw new ValidationError('Offset must be non-negative', { offset });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundError(`User ${userId} not found`, { userId });

        const walletFilter: Prisma.LedgerEntryWhereInput = assetSymbol
            ? { wallet: { user_id: userId, asset: { symbol: assetSymbol } } }
            : { wallet: { user_id: userId } };

        const [total, entries] = await Promise.all([
            prisma.ledgerEntry.count({ where: walletFilter }),
            prisma.ledgerEntry.findMany({
                where: walletFilter,
                include: {
                    wallet: { include: { asset: true } },
                    transaction: { select: { type: true, status: true } }
                },
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: offset
            })
        ]);

        return {
            entries: entries.map(e => ({
                id: e.id,
                entryType: e.entry_type,
                amount: e.amount.toString(),
                balanceAfter: e.balance_after.toString(),
                assetSymbol: e.wallet.asset.symbol,
                txId: e.transaction_id,
                txType: e.transaction.type,
                createdAt: e.created_at.toISOString()
            })),
            pagination: {
                total,
                limit,
                offset,
                returned: entries.length,
                hasMore: offset + entries.length < total
            }
        };
    }

    static async getTransactionHistory(
        userId: string,
        options: {
            type?: TransactionType;
            assetSymbol?: string;
            startDate?: Date;
            endDate?: Date;
            limit?: number;
            offset?: number;
        } = {}
    ) {
        const { type, assetSymbol, startDate, endDate, limit = 50, offset = 0 } = options;

        if (limit < 1 || limit > 500) throw new ValidationError('Limit must be between 1 and 500', { limit });
        if (offset < 0) throw new ValidationError('Offset must be non-negative', { offset });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundError(`User ${userId} not found`, { userId });

        const where: Prisma.TransactionWhereInput = {
            OR: [
                { from_wallet: { user_id: userId } },
                { to_wallet: { user_id: userId } }
            ]
        };

        if (type) where.type = type;
        if (startDate || endDate) {
            where.created_at = {
                ...(startDate && { gte: startDate }),
                ...(endDate && { lte: endDate })
            };
        }

        const [total, transactions] = await Promise.all([
            prisma.transaction.count({ where }),
            prisma.transaction.findMany({
                where,
                include: {
                    from_wallet: { include: { asset: true } },
                    to_wallet: { include: { asset: true } }
                },
                orderBy: { created_at: 'desc' },
                take: limit,
                skip: offset
            })
        ]);

        const filtered = assetSymbol
            ? transactions.filter(tx =>
                tx.from_wallet.asset.symbol === assetSymbol ||
                tx.to_wallet.asset.symbol === assetSymbol
            )
            : transactions;

        return {
            transactions: filtered.map(tx => ({
                id: tx.id,
                idempotencyKey: tx.idempotency_key,
                type: tx.type,
                amount: tx.amount.toString(),
                assetSymbol: tx.from_wallet.asset.symbol,
                fromUser: tx.from_wallet.user_id,
                toUser: tx.to_wallet.user_id,
                status: tx.status,
                createdAt: tx.created_at.toISOString()
            })),
            pagination: {
                total,
                limit,
                offset,
                returned: filtered.length,
                hasMore: offset + filtered.length < total
            }
        };
    }

    static async getTransactionById(transactionId: string) {
        const transaction = await prisma.transaction.findUnique({
            where: { id: transactionId },
            include: {
                from_wallet: { include: { asset: true } },
                to_wallet: { include: { asset: true } },
                ledgerEntries: true
            }
        });

        if (!transaction) throw new NotFoundError(`Transaction ${transactionId} not found`, { transactionId });

        return {
            id: transaction.id,
            idempotencyKey: transaction.idempotency_key,
            type: transaction.type,
            amount: transaction.amount.toString(),
            assetSymbol: transaction.from_wallet.asset.symbol,
            fromUser: transaction.from_wallet.user_id,
            toUser: transaction.to_wallet.user_id,
            status: transaction.status,
            createdAt: transaction.created_at.toISOString(),
            ledger: transaction.ledgerEntries.map(e => ({
                entryType: e.entry_type,
                walletId: e.wallet_id,
                amount: e.amount.toString(),
                balanceAfter: e.balance_after.toString()
            }))
        };
    }
}
