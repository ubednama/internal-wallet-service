import { Router } from 'express';
import { WalletController } from '@/controllers';
import { transactionLimiter, balanceQueryLimiter } from '@/middleware/rate-limit';

const router = Router();

router.post('/transactions', transactionLimiter, WalletController.processTransaction);

// Get a specific transaction by ID
router.get('/transactions/:transactionId', balanceQueryLimiter, WalletController.getTransactionById);

// Get wallet balance for a user
router.get('/:userId/balance', balanceQueryLimiter, WalletController.getBalance);

// Get double-entry ledger for a user  (query: asset, limit, offset)
router.get('/:userId/ledger', balanceQueryLimiter, WalletController.getLedger);

// Get transaction history for a user (params: type, asset, limit, offset, startDate, endDate
router.get('/:userId/transactions', balanceQueryLimiter, WalletController.getTransactionHistory);

export default router;
