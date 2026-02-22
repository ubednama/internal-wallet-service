import { Router } from 'express';
import walletRoutes from '@/routes/v1/wallet.routes';

const router = Router();

router.use('/wallets', walletRoutes);

export default router;
