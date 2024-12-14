import { TokenInfo, WalletTokenSummary, SolscanResponse, TokenAccount } from '../utils/solscan';

export async function fetchWalletData(address: string) {
  try {
    const response = await fetch('/api/wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address,
        action: 'getWalletData'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch wallet data');
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching wallet data:', error);
    throw error;
  }
}

// Helper function to calculate token summary from token accounts
export function calculateTokenSummary(
  tokenAccounts: SolscanResponse<TokenAccount[]>[],
  mainAddress: string,
  bundledAddresses: string[]
): WalletTokenSummary {
  const tokenPositions = new Map<string, {
    token: TokenInfo;
    totalAmount: number;
    usdValue: number;
    positions: { address: string; amount: number; usdValue: number; }[];
  }>();

  let totalUsdValue = 0;

  // Process all token accounts
  tokenAccounts.forEach((accountResponse, index) => {
    if (!accountResponse.success) return;
    
    const address = index === 0 ? mainAddress : bundledAddresses[index - 1];
    
    accountResponse.data.forEach((account: TokenAccount) => {
      if (!account.tokenInfo) return;

      const tokenAddress = account.token_address;
      const amount = account.amount;
      const decimals = account.token_decimals;
      const usdValue = account.tokenInfo.price 
        ? (amount * account.tokenInfo.price) / Math.pow(10, decimals)
        : 0;

      if (!tokenPositions.has(tokenAddress)) {
        tokenPositions.set(tokenAddress, {
          token: account.tokenInfo,
          totalAmount: 0,
          usdValue: 0,
          positions: []
        });
      }

      const position = tokenPositions.get(tokenAddress)!;
      position.totalAmount += amount;
      position.usdValue += usdValue;
      position.positions.push({
        address,
        amount,
        usdValue
      });

      totalUsdValue += usdValue;
    });
  });

  // Convert to array and sort by USD value
  const tokens = Array.from(tokenPositions.values())
    .sort((a, b) => b.usdValue - a.usdValue);

  return {
    totalUsdValue,
    tokens
  };
} 