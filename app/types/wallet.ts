import type { WalletTokenSummary, TokenPositionChange } from '../utils/solscan';
import type { WalletActivity } from './activity';

export interface TrackedWallet {
  address: string;
  bundledWallets: string[];
  lastUpdated: Date;
  tokenSummary?: WalletTokenSummary;
  positionChanges?: { [tokenAddress: string]: TokenPositionChange };
  activities?: WalletActivity[];
}

export interface WalletTransaction {
  signature: string;
  type: 'SWAP' | 'SELL' | 'TRANSFER';
  timestamp: Date;
  fromAddress: string;
  toAddress: string;
  amount: number;
  token: string;
} 