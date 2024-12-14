'use client';

import { useState } from 'react';
import {  formatUSD, formatNumber } from './utils/solscan';
import type { TrackedWallet } from './types/wallet';
import type { TokenPosition, TokenPositionChange, WalletTokenSummary, TransferActivity, DefiActivity } from './utils/solscan';
import type { WalletActivity } from './types/activity';
import { fetchWalletData, calculateTokenSummary } from './services/walletService';

const formatTokenAmount = (amount: number, decimals: number): string => {
  return (amount / Math.pow(10, decimals)).toFixed(decimals > 6 ? 6 : decimals);
};

const getActivityDetails = (activity: DefiActivity | TransferActivity): { details: string; usdValue?: string } => {
  if (activity.activity_type?.includes('SWAP') && 'amount_info' in activity) {
    const amount1 = formatTokenAmount(activity.amount_info.amount1, activity.amount_info.token1_decimals);
    const amount2 = formatTokenAmount(activity.amount_info.amount2, activity.amount_info.token2_decimals);
    const token1Symbol = activity.token1Info?.symbol || 'Unknown';
    const token2Symbol = activity.token2Info?.symbol || 'Unknown';
    const platform = activity.platform === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' ? 'Jupiter' :
                    activity.platform === 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK' ? 'Raydium' :
                    'DEX';

    // Calculate USD values if available
    let usdValue: string | undefined;
    if (activity.token1Info?.price) {
      const usdAmount = activity.amount_info.amount1 * activity.token1Info.price / Math.pow(10, activity.amount_info.token1_decimals);
      usdValue = formatUSD(usdAmount);
    }

    return {
      details: `${platform}: Swapped ${amount1} ${token1Symbol} for ${amount2} ${token2Symbol}`,
      usdValue
    };
  }
  
  if (activity.activity_type === 'ACTIVITY_SPL_TRANSFER') {
    const amount = activity.amount ? formatTokenAmount(activity.amount, activity.token_decimals) : '?';
    const tokenSymbol = activity.tokenInfo?.symbol || 'Unknown';
    const isExchange = knownExchanges.has(activity.to_address);

    // Calculate USD value if available
    let usdValue: string | undefined;
    if (activity.tokenInfo?.price) {
      const usdAmount = activity.amount * activity.tokenInfo.price / Math.pow(10, activity.token_decimals);
      usdValue = formatUSD(usdAmount);
    }

    return {
      details: `${activity.flow === 'out' ? 'Sent' : 'Received'} ${amount} ${tokenSymbol}${isExchange ? ' to exchange' : ''}`,
      usdValue
    };
  }

  return { details: 'Unknown activity' };
};

// Known exchange addresses
const knownExchanges = new Set([
  // Binance
  '3yFwqXBfZY4jBVEmnzWPvtYDzJj36wqQzEPNHnyTvXkh',
  // Add more exchange addresses
]);

// Function to group activities by date
const groupActivitiesByDate = (activities: WalletActivity[]) => {
  const groups: { [date: string]: WalletActivity[] } = {};
  activities.forEach(activity => {
    const date = new Date(activity.timestamp).toLocaleDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(activity);
  });
  return groups;
};

const TokenPositions = ({ positions, positionChanges }: { 
  positions: TokenPosition[]; 
  positionChanges?: { [tokenAddress: string]: TokenPositionChange };
}) => {
  const [expanded, setExpanded] = useState(false);
  const displayPositions = expanded ? positions : positions.slice(0, 3);

  const getPositionChange = (position: TokenPosition) => {
    const change = positionChanges?.[position.token.address];
    if (!change) return null;

    const amountChange = ((position.totalAmount - change.previousAmount) / change.previousAmount) * 100;
    const valueChange = ((position.usdValue - change.previousUsdValue) / change.previousUsdValue) * 100;
    
    return {
      amountChange,
      valueChange,
      timeSinceChange: formatTimeSince(change.changeTimestamp)
    };
  };

  const formatTimeSince = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-2">
      {displayPositions.map((position) => {
        const change = getPositionChange(position);
        const hasChange = change && (Math.abs(change.amountChange) > 0.01 || Math.abs(change.valueChange) > 0.01);
        
        return (
          <div key={position.token.address} 
            className={`bg-gray-800/30 p-3 rounded-lg border ${
              hasChange 
                ? change!.valueChange >= 0 
                  ? 'border-green-500/20 shadow-sm shadow-green-500/10' 
                  : 'border-red-500/20 shadow-sm shadow-red-500/10'
                : 'border-gray-700'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {position.token.icon && (
                  <img 
                    src={position.token.icon} 
                    alt={position.token.symbol}
                    className="w-5 h-5 rounded-full"
                  />
                )}
                <span className="font-medium text-gray-300">
                  {position.token.symbol}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-300">{formatUSD(position.usdValue)}</div>
                <div className="text-xs text-gray-500">
                  {formatNumber(position.totalAmount / Math.pow(10, position.token.decimals))} {position.token.symbol}
                </div>
              </div>
            </div>

            {hasChange && (
              <div className="mb-2 px-2 py-1.5 bg-gray-900/50 rounded border border-gray-700">
                <div className="flex items-center justify-between text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Amount:</span>
                      <span className={change.amountChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {change.amountChange > 0 ? '+' : ''}{change.amountChange.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400">Value:</span>
                      <span className={change.valueChange >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {change.valueChange > 0 ? '+' : ''}{change.valueChange.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500 text-xs">
                      {change.timeSinceChange}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              {position.positions.map((pos) => (
                <div key={pos.address} className="flex justify-between text-xs">
                  <span className="text-gray-500 font-mono">
                    {pos.address.slice(0, 8)}...{pos.address.slice(-4)}
                  </span>
                  <span className="text-gray-400">
                    {formatNumber(pos.amount / Math.pow(10, position.token.decimals))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {positions.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
        >
          {expanded ? 'Show less ↑' : `Show ${positions.length - 3} more tokens ↓`}
        </button>
      )}
    </div>
  );
};

const TokenFilter = ({ 
  tokens,
  selectedTokens, 
  onTokenSelect 
}: { 
  tokens: string[];
  selectedTokens: string[];
  onTokenSelect: (token: string) => void;
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Group tokens by first letter
  const groupedTokens = tokens.reduce((acc, token) => {
    const firstLetter = token.charAt(0).toUpperCase();
    if (!acc[firstLetter]) {
      acc[firstLetter] = [];
    }
    acc[firstLetter].push(token);
    return acc;
  }, {} as { [key: string]: string[] });

  // Filter tokens based on search query
  const filteredGroups = Object.entries(groupedTokens).reduce((acc, [letter, tokens]) => {
    const filtered = tokens.filter(token => 
      token.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[letter] = filtered;
    }
    return acc;
  }, {} as { [key: string]: string[] });

  // Get selected tokens count by category
  const selectedCount = Object.values(groupedTokens).reduce((acc, tokens) => {
    const count = tokens.filter(token => selectedTokens.includes(token)).length;
    return acc + count;
  }, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onTokenSelect('ALL')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            selectedTokens.length === 0
              ? 'bg-purple-500 text-white ring-2 ring-purple-300'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          All Tokens
        </button>
        {selectedTokens.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {selectedCount} selected
            </span>
            <button
              onClick={() => onTokenSelect('ALL')}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          </div>
        )}
        <div className="flex-1" />
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tokens..."
            className="w-48 px-3 py-1 bg-gray-800/50 border border-gray-700 rounded-lg text-xs text-gray-300 
              placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-400"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className={`space-y-4 transition-all duration-300 ${isExpanded ? 'max-h-[600px]' : 'max-h-32'} overflow-y-auto`}>
        {Object.entries(filteredGroups).map(([letter, tokens]) => (
          <div key={letter}>
            <div className="text-xs font-medium text-gray-500 mb-2">{letter}</div>
            <div className="flex flex-wrap gap-2">
              {tokens.map(token => (
                <button
                  key={token}
                  onClick={() => onTokenSelect(token)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedTokens.includes(token)
                      ? 'bg-purple-500 text-white ring-2 ring-purple-300'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {token}
                </button>
              ))}
            </div>
          </div>
        ))}

        {Object.keys(filteredGroups).length === 0 && searchQuery && (
          <div className="text-center py-4 text-gray-500 text-sm">
            No tokens found matching &quot;{searchQuery}&quot;
          </div>
        )}
      </div>

      {Object.keys(groupedTokens).length > 0 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1"
        >
          {isExpanded ? (
            <>
              Show less
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </>
          ) : (
            <>
              Show all tokens
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
};

const UsdValueFilter = ({ value, onChange }: { value: number; onChange: (value: number) => void }) => {
  return (
    <div className="flex items-center gap-2 bg-gray-900/50 p-2 rounded-lg border border-gray-800">
      <span className="text-sm text-gray-400">Min $</span>
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-20 px-2 py-1 bg-gray-800/50 border border-gray-700 rounded text-gray-300 
          font-mono text-sm focus:outline-none focus:ring-1 focus:ring-purple-500/50"
      />
    </div>
  );
};

export default function Home() {
  const [walletAddresses, setWalletAddresses] = useState('');
  const [trackedWallets, setTrackedWallets] = useState<TrackedWallet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [processingStatus, setProcessingStatus] = useState<{[key: string]: string}>({});
  const [walletActivities, setWalletActivities] = useState<{[key: string]: WalletActivity[]}>({});
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [minUsdValue, setMinUsdValue] = useState(1);
  const [expandedWallets, setExpandedWallets] = useState<Set<string>>(new Set());

  const toggleWalletExpansion = (address: string) => {
    setExpandedWallets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(address)) {
        newSet.delete(address);
      } else {
        newSet.add(address);
      }
      return newSet;
    });
  };

  const filterActivitiesByValue = (activities: WalletActivity[]) => {
    return activities.filter(activity => {
      if (!activity.usdValue) return false;
      const value = parseFloat(activity.usdValue.replace(/[^0-9.-]+/g, ''));
      return value >= minUsdValue;
    });
  };

  const calculatePositionChanges = (
    currentWallet: TrackedWallet | undefined,
    newTokenSummary: WalletTokenSummary
  ): { [tokenAddress: string]: TokenPositionChange } => {
    const changes: { [tokenAddress: string]: TokenPositionChange } = {};
    
    // If this is a new wallet, no changes to track yet
    if (!currentWallet?.tokenSummary) return changes;

    // Create a map of current positions for easy lookup
    const currentPositions = new Map(
      currentWallet.tokenSummary.tokens.map(pos => [pos.token.address, pos])
    );

    // Check each new position against the current one
    newTokenSummary.tokens.forEach(newPosition => {
      const currentPosition = currentPositions.get(newPosition.token.address);
      if (currentPosition) {
        // Only record change if there's a difference
        if (newPosition.totalAmount !== currentPosition.totalAmount ||
            newPosition.usdValue !== currentPosition.usdValue) {
          changes[newPosition.token.address] = {
            previousAmount: currentPosition.totalAmount,
            currentAmount: newPosition.totalAmount,
            previousUsdValue: currentPosition.usdValue,
            currentUsdValue: newPosition.usdValue,
            changeTimestamp: new Date()
          };
        } else if (currentWallet.positionChanges?.[newPosition.token.address]) {
          // Preserve existing change if position hasn't changed
          changes[newPosition.token.address] = currentWallet.positionChanges[newPosition.token.address];
        }
      }
    });

    return changes;
  };

  const processWallet = async (address: string) => {
    try {
      setProcessingStatus(prev => ({ ...prev, [address]: 'Finding bundled wallets...' }));
      
      // Fetch all wallet data through our API route
      const data = await fetchWalletData(address);
      
      setProcessingStatus(prev => ({ 
        ...prev, 
        [address]: `Found ${data.bundledAddresses.length} bundled wallets` 
      }));

      // Calculate token summary
      const tokenSummary = calculateTokenSummary(
        data.tokenAccounts,
        address,
        data.bundledAddresses
      );

      // Find current wallet to calculate position changes
      const currentWallet = trackedWallets.find(w => w.address === address);
      const positionChanges = calculatePositionChanges(currentWallet, tokenSummary);

      // Process activities
      const activities: WalletActivity[] = [
        ...(data.defi.data || []).map((activity: DefiActivity) => {
          const activityDetails = getActivityDetails(activity);
          return {
            type: 'SWAP' as const,
            timestamp: activity.time,
            transactionId: activity.trans_id,
            details: activityDetails.details,
            usdValue: activityDetails.usdValue,
            tokenInfo: activity.token1Info
          };
        }),
        ...(data.transfers.data || []).map((transfer: TransferActivity) => {
          const activityDetails = getActivityDetails(transfer);
          return {
            type: 'TRANSFER' as const,
            timestamp: transfer.time,
            transactionId: transfer.trans_id,
            details: activityDetails.details,
            usdValue: activityDetails.usdValue,
            tokenInfo: transfer.tokenInfo
          };
        })
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setWalletActivities(prev => ({
        ...prev,
        [address]: activities
      }));

      return {
        address,
        bundledWallets: data.bundledAddresses,
        lastUpdated: new Date(),
        tokenSummary,
        positionChanges
      };
    } catch (err) {
      console.error(`Error processing wallet ${address}:`, err);
      throw err;
    }
  };

  const handleAddWallets = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setProcessingStatus({});

    try {
      // Split addresses by newline and filter out empty lines
      const addresses = walletAddresses
        .split('\n')
        .map(addr => addr.trim())
        .filter(addr => addr.length > 0);

      if (addresses.length === 0) {
        throw new Error('Please enter at least one wallet address');
      }

      // Validate all addresses first
      for (const address of addresses) {
        if (!address.match(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)) {
          throw new Error(`Invalid Solana wallet address: ${address}`);
        }
        if (trackedWallets.some(w => w.address === address)) {
          throw new Error(`Wallet is already being tracked: ${address}`);
        }
      }

      // Process all addresses
      const newWallets: TrackedWallet[] = [];
      
      for (const address of addresses) {
        try {
          const wallet = await processWallet(address);
          newWallets.push(wallet);
          setProcessingStatus(prev => ({ ...prev, [address]: 'Success' }));
        } catch {
          setProcessingStatus(prev => ({ ...prev, [address]: 'Failed' }));
        }
      }

      if (newWallets.length > 0) {
        setTrackedWallets([...trackedWallets, ...newWallets]);
        setWalletAddresses('');
      } else {
        throw new Error('Failed to add any wallets');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add wallets');
    } finally {
      setLoading(false);
    }
  };

  const getAllTokens = (): string[] => {
    const tokens = new Set<string>();
    trackedWallets.forEach(wallet => {
      if (wallet.tokenSummary) {
        wallet.tokenSummary.tokens.forEach(position => {
          tokens.add(position.token.symbol);
        });
      }
    });
    return Array.from(tokens).sort();
  };

  const handleTokenSelect = (token: string) => {
    if (token === 'ALL') {
      setSelectedTokens([]);
      return;
    }
    
    setSelectedTokens(prev => {
      const isSelected = prev.includes(token);
      if (isSelected) {
        return prev.filter(t => t !== token);
      } else {
        return [...prev, token];
      }
    });
  };

  const getFilteredWallets = () => {
    if (selectedTokens.length === 0) {
      return trackedWallets;
    }

    return trackedWallets.filter(wallet => {
      if (!wallet.tokenSummary?.tokens) return false;
      
      // Check if wallet has any of the selected tokens
      return wallet.tokenSummary.tokens.some(position => 
        selectedTokens.includes(position.token.symbol)
      );
    }).map(wallet => ({
      ...wallet,
      // Filter token positions to only show selected tokens
      tokenSummary: wallet.tokenSummary ? {
        ...wallet.tokenSummary,
        tokens: wallet.tokenSummary.tokens.filter(position =>
          selectedTokens.includes(position.token.symbol)
        )
      } : undefined,
      // Filter activities to only show those related to selected tokens
      activities: walletActivities[wallet.address]?.filter(activity => {
        if (activity.type === 'SWAP') {
          // For swaps, check if either token is in the selected tokens
          const tokens = activity.details.match(/\b[A-Z]+\b/g) || [];
          return tokens.some(token => selectedTokens.includes(token));
        } else if (activity.type === 'TRANSFER') {
          // For transfers, check if the token is in the selected tokens
          const token = activity.tokenInfo?.symbol;
          return token && selectedTokens.includes(token);
        }
        return false;
      })
    }));
  };

  return (
    <div className="min-h-screen bg-[#0D1117] text-gray-100">
      {/* Animated gradient background */}
      <div className="fixed inset-0 bg-[#0D1117]">
        <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/30 via-transparent to-blue-900/30 animate-gradient" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f0a_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f0a_1px,transparent_1px)] bg-[size:14px_24px]" />
      </div>

      <main className="relative max-w-6xl mx-auto p-4 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-purple-500">
              WAL
            </span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-500">
              TRACK
            </span>
            <span className="text-xs ml-1 text-gray-500 font-normal">v1</span>
          </h1>
          <div className="flex items-center gap-4 bg-gray-900/50 p-2 rounded-lg border border-gray-800">
            <div className="text-sm">
              <span className="text-gray-400">Tracked:</span>{' '}
              <span className="text-purple-400 font-mono bg-purple-500/10 px-2 py-0.5 rounded">
                {trackedWallets.length}
              </span>
            </div>
          </div>
        </div>

        {/* Update form styling */}
        <form onSubmit={handleAddWallets} className="mb-8 sm:mb-12 bg-gray-900/50 p-4 sm:p-6 rounded-xl border border-gray-800 backdrop-blur-sm">
          <div className="flex flex-col gap-4">
            <textarea
              value={walletAddresses}
              onChange={(e) => setWalletAddresses(e.target.value)}
              placeholder="Enter Solana wallet addresses (one per line)"
              className="w-full p-3 sm:p-4 bg-gray-800/50 border border-gray-700 rounded-lg font-mono text-sm sm:text-base text-gray-300 
                placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 h-32
                transition-all duration-200"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 text-white px-4 sm:px-6 py-3 
                rounded-lg font-medium hover:from-blue-600 hover:via-purple-600 hover:to-blue-600 
                disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-500 
                bg-[length:200%_auto] hover:bg-right-bottom text-sm sm:text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : 'Track Wallets'}
            </button>
          </div>

          {/* Update status displays */}
          {error && (
            <div className="mt-4 p-3 sm:p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 backdrop-blur-sm text-sm">
              {error}
            </div>
          )}
          {Object.entries(processingStatus).length > 0 && (
            <div className="mt-4 p-3 sm:p-4 bg-gray-800/30 border border-gray-700 rounded-lg backdrop-blur-sm">
              <h3 className="font-medium text-gray-300 mb-3 text-sm">Processing Status</h3>
              <div className="space-y-2">
                {Object.entries(processingStatus).map(([address, status]) => (
                  <div key={address} 
                    className="flex items-center justify-between text-xs sm:text-sm bg-gray-800/30 p-2 rounded-lg border border-gray-700/50">
                    <span className="font-mono text-gray-400 truncate max-w-[150px] sm:max-w-none">
                      {address.slice(0, 12)}...
                    </span>
                    <span className={`px-2 py-0.5 rounded ${
                      status === 'Success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                      status === 'Failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>
                      {status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Update wallet list header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 sm:mb-6">
            <h2 className="text-lg sm:text-xl font-semibold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Tracked Wallets
            </h2>
            <div className="text-sm bg-gray-900/50 px-3 sm:px-4 py-2 rounded-lg border border-gray-800">
              <span className="text-gray-400">Total Value:</span>{' '}
              <span className="text-green-400 font-mono">
                {formatUSD(
                  trackedWallets.reduce((sum, wallet) => 
                    sum + (wallet.tokenSummary?.totalUsdValue || 0), 0
                  )
                )}
              </span>
            </div>
          </div>

          {/* Update token filter styling */}
          {trackedWallets.length > 0 && (
            <div className="bg-gray-900/50 p-3 sm:p-4 rounded-xl border border-gray-800 backdrop-blur-sm overflow-x-auto">
              <TokenFilter
                tokens={getAllTokens()}
                selectedTokens={selectedTokens}
                onTokenSelect={handleTokenSelect}
              />
            </div>
          )}
        </div>

        {/* Update wallet cards */}
        {trackedWallets.length === 0 ? (
          <div className="text-center py-8 sm:py-12 bg-gray-900/50 border border-gray-800 rounded-xl backdrop-blur-sm">
            <p className="text-gray-500 text-sm sm:text-base">No wallets are being tracked yet</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:gap-6">
            {getFilteredWallets().map((wallet) => {
              const isExpanded = expandedWallets.has(wallet.address);
              return (
                <div key={wallet.address} 
                  className="group bg-gray-900/50 border border-gray-800 rounded-xl hover:bg-gray-900/70 
                    transition-all duration-300 backdrop-blur-sm hover:shadow-lg hover:shadow-purple-500/10">
                  <div 
                    onClick={() => toggleWalletExpansion(wallet.address)}
                    className="p-4 sm:p-6 cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <svg 
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        <span className="font-mono text-xs sm:text-sm text-gray-400 truncate">
                          {wallet.address}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500 ml-6">
                        Last updated: {wallet.lastUpdated.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 ml-6">
                      <div className="text-center">
                        <span className="text-xs text-gray-400 block">Bundled</span>
                        <span className="text-sm text-purple-400 font-medium">
                          {wallet.bundledWallets.length}
                        </span>
                      </div>
                      {wallet.tokenSummary && (
                        <div className="text-center">
                          <span className="text-xs text-gray-400 block">Value</span>
                          <span className="text-sm text-green-400 font-medium">
                            {formatUSD(
                              wallet.tokenSummary.tokens.reduce((sum, pos) => sum + pos.usdValue, 0)
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-gray-800">
                      {wallet.tokenSummary && wallet.tokenSummary.tokens.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-xs sm:text-sm font-medium text-gray-300 mb-3">Token Positions</h3>
                          <TokenPositions 
                            positions={wallet.tokenSummary.tokens} 
                            positionChanges={wallet.positionChanges}
                          />
                        </div>
                      )}
                      
                      {wallet.activities && wallet.activities.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                            <h3 className="text-xs sm:text-sm font-medium text-gray-300">Recent Activities</h3>
                            <UsdValueFilter value={minUsdValue} onChange={setMinUsdValue} />
                          </div>
                          {Object.entries(groupActivitiesByDate(filterActivitiesByValue(wallet.activities)))
                            .slice(0, 3)
                            .map(([date, activities]) => (
                              <div key={date} className="mb-4">
                                <div className="text-xs text-gray-500 mb-2">{date}</div>
                                <div className="space-y-2">
                                  {activities.map((activity, index) => (
                                    <div key={`${activity.transactionId}-${index}`} 
                                      className="text-xs sm:text-sm bg-gray-800/30 p-2 rounded hover:bg-gray-800/50 transition-colors"
                                    >
                                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          {activity.tokenInfo?.icon && (
                                            <img 
                                              src={activity.tokenInfo.icon} 
                                              alt={activity.tokenInfo.symbol}
                                              className="w-4 h-4 rounded-full"
                                            />
                                          )}
                                          <span className={
                                            activity.type === 'SWAP' ? 'text-green-400' :
                                            activity.type === 'TRANSFER' && activity.details.includes('exchange') ? 'text-yellow-400' :
                                            activity.type === 'TRANSFER' ? 'text-blue-400' :
                                            'text-purple-400'
                                          }>
                                            {activity.type}
                                          </span>
                                          <a 
                                            href={`https://solscan.io/tx/${activity.transactionId}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-gray-500 hover:text-gray-300"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                          </a>
                                        </div>
                                        <div className="flex flex-row sm:flex-col items-start sm:items-end gap-2 sm:gap-0 text-xs">
                                          <span className="text-gray-500">
                                            {new Date(activity.timestamp).toLocaleTimeString()}
                                          </span>
                                          {activity.usdValue && (
                                            <span className="text-green-400">
                                              {activity.usdValue}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-gray-400 text-xs mt-1">{activity.details}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          {wallet.activities.length > 0 && filterActivitiesByValue(wallet.activities).length === 0 && (
                            <p className="text-xs sm:text-sm text-gray-500 text-center py-4">
                              No activities above ${minUsdValue}
                            </p>
                          )}
                          <button 
                            className="mt-2 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(`https://solscan.io/account/${wallet.address}`, '_blank');
                            }}
                          >
                            View all activities 
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
