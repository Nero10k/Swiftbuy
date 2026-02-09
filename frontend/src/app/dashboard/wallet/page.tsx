'use client';

import { useQuery } from '@tanstack/react-query';
import { walletApi } from '@/lib/api';
import { formatUSD, formatDate } from '@/lib/utils';
import { Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAppStore } from '@/lib/store';

export default function WalletPage() {
  const { user } = useAppStore();

  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance().then((res) => res.data.data),
    enabled: !!user?.walletAddress,
  });

  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: () =>
      walletApi.getTransactions({ limit: 20 }).then((res) => res.data.data),
    enabled: !!user?.walletAddress,
  });

  if (!user?.walletAddress) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallet</h1>
          <p className="text-gray-400 mt-1">Manage your USDC wallet</p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/5 p-12 text-center">
          <Wallet className="h-12 w-12 mx-auto mb-3 text-gray-600" />
          <h3 className="text-lg font-medium text-white">No wallet connected</h3>
          <p className="text-gray-400 mt-1 mb-4">
            Connect your USDC wallet to start shopping with your AI agents
          </p>
          <a
            href="/dashboard/settings"
            className="inline-flex px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
          >
            Connect Wallet
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Wallet</h1>
        <p className="text-gray-400 mt-1">Your USDC balance and transaction history</p>
      </div>

      {/* Balance card */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-brand-200 text-sm font-medium">Available Balance</p>
            <p className="text-4xl font-bold mt-2">
              {balanceLoading ? '...' : `${balanceData?.balance?.toFixed(2) || '0.00'} USDC`}
            </p>
            <p className="text-brand-200 text-sm mt-1">
              ≈ {formatUSD(balanceData?.balanceUSD || 0)}
            </p>
          </div>
          <div className="text-right">
            <Wallet className="h-12 w-12 text-brand-300" />
            <p className="text-xs text-brand-300 mt-2 font-mono">
              {user.walletAddress?.substring(0, 6)}...{user.walletAddress?.substring(-4)}
            </p>
          </div>
        </div>
      </div>

      {/* Spending limits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/[0.03] rounded-xl border border-white/5 p-5">
          <p className="text-sm text-gray-400">Daily Limit</p>
          <p className="text-xl font-bold text-white mt-1">
            {formatUSD(user.preferences?.spendingLimit?.daily || 500)}
          </p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/5 p-5">
          <p className="text-sm text-gray-400">Monthly Limit</p>
          <p className="text-xl font-bold text-white mt-1">
            {formatUSD(user.preferences?.spendingLimit?.monthly || 5000)}
          </p>
        </div>
        <div className="bg-white/[0.03] rounded-xl border border-white/5 p-5">
          <p className="text-sm text-gray-400">Auto-approve Below</p>
          <p className="text-xl font-bold text-white mt-1">
            {formatUSD(user.preferences?.maxAutoApprove || 25)}
          </p>
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-white/[0.03] rounded-xl border border-white/5">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">Transaction History</h2>
        </div>
        <div className="divide-y divide-white/5">
          {txLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto text-gray-500" />
            </div>
          ) : txData?.transactions?.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <p>No transactions yet</p>
            </div>
          ) : (
            txData?.transactions?.map((tx: any) => (
              <div key={tx._id} className="flex items-center justify-between p-4 px-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      tx.type === 'purchase'
                        ? 'bg-red-500/10 text-red-400'
                        : 'bg-green-500/10 text-green-400'
                    }`}
                  >
                    {tx.type === 'purchase' ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownLeft className="h-4 w-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">
                      {tx.metadata?.productTitle || tx.type}
                    </p>
                    <p className="text-xs text-gray-500">
                      {tx.transactionId} • {formatDate(tx.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      tx.type === 'purchase' ? 'text-red-400' : 'text-green-400'
                    }`}
                  >
                    {tx.type === 'purchase' ? '-' : '+'}
                    {tx.usdcAmount?.toFixed(2)} USDC
                  </p>
                  <p className="text-xs text-gray-500">
                    {tx.offRampFee > 0 && `Fee: ${tx.offRampFee.toFixed(2)} USDC`}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
