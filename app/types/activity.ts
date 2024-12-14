import type { TokenInfo } from '../utils/solscan';

export interface WalletActivity {
  type: 'SWAP' | 'TRANSFER' | 'LIQUIDITY';
  timestamp: string;
  transactionId: string;
  details: string;
  usdValue?: string;
  tokenInfo?: TokenInfo;
} 