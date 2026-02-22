import { z } from 'zod';
import { TransactionType } from '@/types/enums';
import { TRANSACTION_LIMITS } from '@/constants';

export const transactionSchema = z.object({
    userId: z.string().min(1, 'userId is required'),
    type: z.enum(TransactionType),
    amount: z
        .number()
        .positive('amount must be positive')
        .max(TRANSACTION_LIMITS.MAX_AMOUNT, `amount exceeds maximum (${TRANSACTION_LIMITS.MAX_AMOUNT})`),
    assetSymbol: z.string().min(1, 'assetSymbol is required').toUpperCase()
});

export type TransactionPayload = z.infer<typeof transactionSchema>;
