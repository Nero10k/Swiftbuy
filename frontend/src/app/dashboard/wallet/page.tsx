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
    queryFn: () => walletApi.getTransactions({ limit: 20 }).then((res) => res.data.data),
    enabled: !!user?.walletAddress,
  });

  if (!user?.walletAddress) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Wallet</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your USDC wallet</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto mb-3 text-gray-600" />
          <p className="text-sm font-medium text-white">No wallet connected</p>
          <p className="text-xs text-gray-500 mt-1 mb-4">
            Connect your USDC wallet to start shopping
          </p>
          <a href="/dashboard/settings"
            className="inline-flex px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors">
            Connect Wallet
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">Your USDC balance and transaction history</p>
      </div>

      {/* Balance card */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-600/[0.08] to-brand-800/[0.04] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Available Balance</p>
            <p className="text-3xl font-bold text-white mt-1">
              {balanceLoading ? '...' : `${balanceData?.balance?.toFixed(2) || '0.00'} USDC`}
            </p>
            <p className="text-xs text-gray-500 mt-1">≈ {formatUSD(balanceData?.balanceUSD || 0)}</p>
          </div>
          <div className="text-right">
            <Wallet className="h-10 w-10 text-brand-400/30" />
            <p className="text-[10px] text-gray-500 mt-2 font-mono">
              {user.walletAddress?.substring(0, 6)}...{user.walletAddress?.substring(-4)}
            </p>
          </div>
        </div>
      </div>

      {/* Spending limits */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Daily Limit</p>
          <p className="text-lg font-bold text-white mt-1">{formatUSD(user.preferences?.spendingLimit?.daily || 500)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Monthly Limit</p>
          <p className="text-lg font-bold text-white mt-1">{formatUSD(user.preferences?.spendingLimit?.monthly || 5000)}</p>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Auto-approve</p>
          <p className="text-lg font-bold text-white mt-1">{formatUSD(user.preferences?.maxAutoApprove || 25)}</p>
        </div>
      </div>

      {/* Transaction history */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Transaction History</h2>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {txLoading ? (
            <div className="p-8 text-center">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto text-gray-600" />
            </div>
          ) : txData?.transactions?.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">No transactions yet</div>
          ) : (
            txData?.transactions?.map((tx: any) => (
              <div key={tx._id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${tx.type === 'purchase' ? 'bg-red-500/10 text-red-400' : 'bg-green-500/10 text-green-400'}`}>
                    {tx.type === 'purchase' ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownLeft className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p className="text-sm text-white">{tx.metadata?.productTitle || tx.type}</p>
                    <p className="text-[10px] text-gray-500">{tx.transactionId} · {formatDate(tx.createdAt)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${tx.type === 'purchase' ? 'text-red-400' : 'text-green-400'}`}>
                    {tx.type === 'purchase' ? '-' : '+'}{tx.usdcAmount?.toFixed(2)} USDC
                  </p>
                  {tx.offRampFee > 0 && <p className="text-[10px] text-gray-500">Fee: {tx.offRampFee.toFixed(2)} USDC</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
