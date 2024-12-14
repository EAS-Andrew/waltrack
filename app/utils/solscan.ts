import axios from 'axios';

const SOLSCAN_API_BASE = 'https://pro-api.solscan.io/v2.0';
const COMMON_TOKENS: { [key: string]: string } = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'USDT',
  // Add more common tokens as needed
};

// We'll need to add the API key to headers
const headers = {
  'accept': 'application/json',
  'token': process.env.SOLSCAN_API_KEY || ''
};

interface SolscanResponse<T> {
  success: boolean;
  data: T;
}

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  icon?: string;
  price?: number;
  price_change_24h?: number;
  volume_24h?: number;
  market_cap?: number;
  market_cap_rank?: number;
  holder?: number;
  supply?: string;
}

export interface TransferActivity {
  block_id: number;
  trans_id: string;
  block_time: number;
  time: string;
  activity_type: 'ACTIVITY_SPL_TRANSFER' | 'ACTIVITY_SPL_BURN' | 'ACTIVITY_SPL_MINT' | 'ACTIVITY_SPL_CREATE_ACCOUNT';
  from_address: string;
  to_address: string;
  token_address: string;
  token_decimals: number;
  amount: number;
  flow: 'in' | 'out';
  usdValue?: number;
  tokenInfo?: TokenInfo;
}

export interface DefiActivity {
  block_id: number;
  trans_id: string;
  block_time: number;
  time: string;
  activity_type: 'ACTIVITY_TOKEN_SWAP' | 'ACTIVITY_AGG_TOKEN_SWAP' | 'ACTIVITY_TOKEN_ADD_LIQ' | 'ACTIVITY_TOKEN_REMOVE_LIQ';
  from_address: string;
  to_address: string;
  sources: string[];
  platform: string;
  amount_info: {
    token1: string;
    token1_decimals: number;
    amount1: number;
    token2: string;
    token2_decimals: number;
    amount2: number;
    routers: Array<{
      token1: string;
      token1_decimals: number;
      amount1: string;
      token2: string;
      token2_decimals: number;
      amount2: string;
    }>;
  };
  token1Info?: TokenInfo;
  token2Info?: TokenInfo;
  usdValue?: number;
}

export interface TokenAccount {
  token_account: string;
  token_address: string;
  amount: number;
  token_decimals: number;
  owner: string;
  tokenInfo?: TokenInfo;
  usdValue?: number;
}

export interface TokenPosition {
  token: TokenInfo;
  totalAmount: number;
  usdValue: number;
  positions: {
    address: string;
    amount: number;
    usdValue: number;
  }[];
}

export interface WalletTokenSummary {
  totalUsdValue: number;
  tokens: TokenPosition[];
}

export interface TokenPositionChange {
  previousAmount: number;
  currentAmount: number;
  previousUsdValue: number;
  currentUsdValue: number;
  changeTimestamp: Date;
}

// Cache token info to avoid repeated API calls
const tokenInfoCache: { [address: string]: TokenInfo & { timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getTokenInfo(tokenAddress: string): Promise<TokenInfo | undefined> {
  const now = Date.now();
  const cached = tokenInfoCache[tokenAddress];
  
  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    return cached;
  }

  if (COMMON_TOKENS[tokenAddress]) {
    const info: TokenInfo = {
      symbol: COMMON_TOKENS[tokenAddress],
      name: COMMON_TOKENS[tokenAddress],
      decimals: tokenAddress === 'So11111111111111111111111111111111111111112' ? 9 : 6,
      address: tokenAddress
    };
    tokenInfoCache[tokenAddress] = { ...info, timestamp: now };
    return info;
  }

  try {
    const response = await axios.get(`${SOLSCAN_API_BASE}/token/meta`, {
      params: { address: tokenAddress },
      headers
    });

    if (response.data.success) {
      const data = response.data.data;
      const info: TokenInfo = {
        symbol: data.symbol?.trim() || 'Unknown',
        name: data.name?.trim() || 'Unknown Token',
        decimals: data.decimals || 0,
        address: tokenAddress,
        icon: data.icon,
        price: data.price,
        price_change_24h: data.price_change_24h,
        volume_24h: data.volume_24h,
        market_cap: data.market_cap,
        market_cap_rank: data.market_cap_rank,
        holder: data.holder
      };
      tokenInfoCache[tokenAddress] = { ...info, timestamp: now };
      return info;
    }
  } catch (error) {
    console.error('Error fetching token info:', error);
  }
  return undefined;
}

export async function getWalletTransfers(address: string, pageSize: number = 100) {
  try {
    const response = await axios.get<SolscanResponse<TransferActivity[]>>(`${SOLSCAN_API_BASE}/account/transfer`, {
      params: {
        address,
        activity_type: ['ACTIVITY_SPL_TRANSFER'],
        page: 1,
        page_size: pageSize,
        sort_by: 'block_time',
        sort_order: 'desc'
      },
      headers
    });

    if (response.data.success) {
      // Enhance transfer data with token info
      const enhancedData = await Promise.all(
        response.data.data.map(async (transfer) => {
          const tokenInfo = await getTokenInfo(transfer.token_address);
          return { ...transfer, tokenInfo };
        })
      );
      return { ...response.data, data: enhancedData };
    }
    return response.data;
  } catch (error) {
    console.error('Error fetching wallet transfers:', error);
    throw error;
  }
}

export async function getDefiActivities(address: string, pageSize: number = 100) {
  try {
    const response = await axios.get<SolscanResponse<DefiActivity[]>>(`${SOLSCAN_API_BASE}/account/defi/activities`, {
      params: {
        address,
        activity_type: ['ACTIVITY_TOKEN_SWAP', 'ACTIVITY_AGG_TOKEN_SWAP'],
        page: 1,
        page_size: pageSize,
        sort_by: 'block_time',
        sort_order: 'desc'
      },
      headers
    });

    if (response.data.success) {
      // Enhance DeFi data with token info
      const enhancedData = await Promise.all(
        response.data.data.map(async (activity) => {
          if (activity.amount_info) {
            const [token1Info, token2Info] = await Promise.all([
              getTokenInfo(activity.amount_info.token1),
              getTokenInfo(activity.amount_info.token2)
            ]);
            return { ...activity, token1Info, token2Info };
          }
          return activity;
        })
      );
      return { ...response.data, data: enhancedData };
    }
    return response.data;
  } catch (error) {
    console.error('Error fetching DeFi activities:', error);
    throw error;
  }
}

export async function getTokenAccounts(address: string, pageSize: number = 30) {
  try {
    const response = await axios.get<SolscanResponse<TokenAccount[]>>(`${SOLSCAN_API_BASE}/account/token-accounts`, {
      params: {
        address,
        type: 'token',
        page: 1,
        page_size: pageSize,
        hide_zero: true
      },
      headers
    });

    if (response.data.success) {
      // Enhance token account data with token info
      const enhancedData = await Promise.all(
        response.data.data.map(async (account) => {
          const tokenInfo = await getTokenInfo(account.token_address);
          return { ...account, tokenInfo };
        })
      );
      return { ...response.data, data: enhancedData };
    }
    return response.data;
  } catch (error) {
    console.error('Error fetching token accounts:', error);
    throw error;
  }
}

// Helper function to find bundled wallets with enhanced info
export async function findBundledWallets(address: string): Promise<string[]> {
  try {
    const transfers = await getWalletTransfers(address);
    if (!transfers.success) return [];

    // Get unique recipient addresses from outgoing transfers
    const bundledWallets = new Set<string>();
    transfers.data
      .filter(transfer => transfer.flow === 'out')
      .forEach(transfer => {
        bundledWallets.add(transfer.to_address);
      });

    return Array.from(bundledWallets);
  } catch (error) {
    console.error('Error finding bundled wallets:', error);
    return [];
  }
}

// Helper function to format USD value
export const formatUSD = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(value);
};

// Add significance thresholds
const SIGNIFICANCE_THRESHOLDS = {
  MIN_USD_VALUE: 100, // Minimum USD value to be considered significant
  MIN_HOLDER_PERCENTAGE: 0.01, // Minimum percentage of total supply (1%)
};

export async function getWalletTokenSummary(mainAddress: string, bundledAddresses: string[]): Promise<WalletTokenSummary> {
  const allAddresses = [mainAddress, ...bundledAddresses];
  const tokenPositions = new Map<string, TokenPosition>();
  let totalUsdValue = 0;

  // Fetch token accounts for all addresses
  await Promise.all(allAddresses.map(async (address) => {
    try {
      const response = await getTokenAccounts(address);
      if (!response.success) return;

      for (const account of response.data) {
        if (!account.tokenInfo) continue;

        const tokenAddress = account.token_address;
        const amount = account.amount;
        const decimals = account.token_decimals;
        const usdValue = account.tokenInfo.price 
          ? (amount * account.tokenInfo.price) / Math.pow(10, decimals)
          : 0;

        // Skip if the USD value is below threshold
        if (usdValue < SIGNIFICANCE_THRESHOLDS.MIN_USD_VALUE) continue;

        // Calculate holder percentage if holder count is available
        if (account.tokenInfo.holder) {
          const totalSupply = account.tokenInfo.supply 
            ? parseFloat(account.tokenInfo.supply)
            : 0;
          if (totalSupply > 0) {
            const holderPercentage = (amount / totalSupply) * 100;
            // Skip if holder percentage is below threshold
            if (holderPercentage < SIGNIFICANCE_THRESHOLDS.MIN_HOLDER_PERCENTAGE) continue;
          }
        }

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
      }
    } catch (error) {
      console.error(`Error fetching token accounts for ${address}:`, error);
    }
  }));

  // Sort tokens by USD value and filter out insignificant total positions
  const sortedTokens = Array.from(tokenPositions.values())
    .filter(position => position.usdValue >= SIGNIFICANCE_THRESHOLDS.MIN_USD_VALUE)
    .sort((a, b) => b.usdValue - a.usdValue);

  return {
    totalUsdValue,
    tokens: sortedTokens
  };
}

export const formatNumber = (num: number): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true
  });

  if (num >= 1_000_000_000) {
    return `${formatter.format(num / 1_000_000_000)}B`;
  }
  if (num >= 1_000_000) {
    return `${formatter.format(num / 1_000_000)}M`;
  }
  if (num >= 1_000) {
    return `${formatter.format(num / 1_000)}K`;
  }
  return formatter.format(num);
}; 