import { NextResponse } from 'next/server';
import { getTokenAccounts, getWalletTransfers, getDefiActivities, findBundledWallets } from '@/app/utils/solscan';

export async function POST(request: Request) {
  try {
    const { address, action } = await request.json();

    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    switch (action) {
      case 'getWalletData': {
        const [transfers, defi, bundledAddresses] = await Promise.all([
          getWalletTransfers(address),
          getDefiActivities(address),
          findBundledWallets(address)
        ]);

        // Get token accounts for main wallet and bundled wallets
        const allAddresses = [address, ...bundledAddresses];
        const tokenAccounts = await Promise.all(
          allAddresses.map(addr => getTokenAccounts(addr))
        );

        return NextResponse.json({
          transfers,
          defi,
          bundledAddresses,
          tokenAccounts
        });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 