'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { walletApi } from '@/lib/api';
import { formatUSD } from '@/lib/utils';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Shield,
  Copy,
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
  CreditCard,
  Snowflake,
  ShieldOff,
  Link2,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

export default function WalletPage() {
  const { user, updateUser } = useAppStore();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  // Fetch wallet status
  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['wallet-status'],
    queryFn: () => walletApi.getStatus().then((res) => res.data.data),
  });

  // Fetch balance (only when ready)
  const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance().then((res) => res.data.data),
    enabled: statusData?.ready === true,
    refetchInterval: 30000,
  });

  // Fetch transactions
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: () => walletApi.getTransactions({ limit: 20 }).then((res) => res.data.data),
    enabled: statusData?.ready === true,
  });

  // Connect existing Karma account (accepts sk_live_ or sk_agent_ keys)
  const connectMutation = useMutation({
    mutationFn: (karmaKey: string) => walletApi.connectExisting(karmaKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-status'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });

  // KYC status check mutation
  const kycCheckMutation = useMutation({
    mutationFn: () => walletApi.getKycStatus(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['wallet-status'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      if (res.data.data.kycStatus === 'approved') {
        updateUser({
          karma: {
            ...user?.karma,
            kycStatus: 'approved',
            cardLast4: res.data.data.cardLast4,
            depositAddress: res.data.data.depositAddress,
          },
        } as any);
      }
    },
  });

  // Freeze/unfreeze mutations
  const freezeMutation = useMutation({
    mutationFn: () => walletApi.freezeCard(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-status'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });

  const unfreezeMutation = useMutation({
    mutationFn: () => walletApi.unfreezeCard(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-status'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
    },
  });

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
      </div>
    );
  }

  const isConnected = statusData?.connected;
  const kycStatus = statusData?.kycStatus || 'none';

  /* ─── State: Not connected — show connect view ─── */
  if (!isConnected) {
    return <ConnectView connectMutation={connectMutation} />;
  }

  /* ─── State: Connected but KYC not approved ─── */
  if (kycStatus !== 'approved') {
    return (
      <KycPendingView
        kycStatus={kycStatus}
        kycCheckMutation={kycCheckMutation}
        connectMutation={connectMutation}
      />
    );
  }

  /* ─── State: Ready — show balance, card, transactions ─── */
  const balance = balanceData?.balance ?? 0;
  const depositAddress = balanceData?.depositAddress || statusData?.depositAddress || '';
  const cardLast4 = balanceData?.cardLast4 || statusData?.cardLast4 || '****';
  const cardFrozen = balanceData?.cardFrozen || statusData?.cardFrozen || false;
  const dailyRemaining = balanceData?.dailyRemaining;
  const monthlyRemaining = balanceData?.monthlyRemaining;
  const transactions = txData?.transactions || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Wallet</h1>
          <p className="text-sm text-gray-500 mt-1">Your Karma Agent Card</p>
        </div>
        <button
          onClick={() => refetchBalance()}
          className="p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5"
        >
          <RefreshCw className={`h-4 w-4 ${balanceLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Card frozen banner */}
      {cardFrozen && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <Snowflake className="h-5 w-5 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-300">Card is frozen</p>
            <p className="text-xs text-red-400/70">No purchases can be made until you unfreeze.</p>
          </div>
          <button
            onClick={() => unfreezeMutation.mutate()}
            disabled={unfreezeMutation.isPending}
            className="text-xs px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            {unfreezeMutation.isPending ? 'Unfreezing...' : 'Unfreeze'}
          </button>
        </div>
      )}

      {/* Balance card */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-600/[0.08] to-brand-800/[0.04] p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium">Available Balance</p>
            <p className="text-3xl font-bold text-white mt-1">
              {balanceLoading ? '...' : `${balance.toFixed(2)} USDC`}
            </p>
            <p className="text-xs text-gray-500 mt-1">≈ {formatUSD(balance)}</p>
          </div>
          <div className="text-right">
            <CreditCard className="h-10 w-10 text-brand-400/30" />
            <p className="text-xs text-gray-500 mt-2">•••• {cardLast4}</p>
          </div>
        </div>
      </div>

      {/* Deposit address */}
      {depositAddress && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
            Deposit Address (Solana — USDC)
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs text-gray-300 font-mono bg-black/20 px-3 py-2 rounded-lg truncate">
              {depositAddress}
            </code>
            <button
              onClick={() => copyAddress(depositAddress)}
              className="p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/5 shrink-0"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[10px] text-gray-600 mt-2">
            Send USDC (SPL) to this address. Balance updates within seconds.
          </p>
        </div>
      )}

      {/* Limits */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <LimitCard label="Per Transaction" value={formatUSD(statusData?.perTxnLimit || 500)} />
        <LimitCard label="Daily Limit" value={formatUSD(statusData?.dailyLimit || 1000)} />
        <LimitCard label="Daily Remaining" value={dailyRemaining != null ? formatUSD(dailyRemaining) : '—'} />
        <LimitCard label="Monthly Remaining" value={monthlyRemaining != null ? formatUSD(monthlyRemaining) : '—'} />
      </div>

      {/* Card actions */}
      <div className="flex gap-3">
        {!cardFrozen ? (
          <button
            onClick={() => freezeMutation.mutate()}
            disabled={freezeMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-colors"
          >
            <Snowflake className="h-4 w-4" />
            {freezeMutation.isPending ? 'Freezing...' : 'Freeze Card'}
          </button>
        ) : (
          <button
            onClick={() => unfreezeMutation.mutate()}
            disabled={unfreezeMutation.isPending}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl hover:bg-green-500/20 transition-colors"
          >
            <ShieldOff className="h-4 w-4" />
            {unfreezeMutation.isPending ? 'Unfreezing...' : 'Unfreeze Card'}
          </button>
        )}
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
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs">
              No transactions yet. Fund your wallet and start shopping!
            </div>
          ) : (
            transactions.map((tx: any, i: number) => (
              <div key={tx._id || tx.id || i} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${
                    tx.type === 'purchase' || tx.amount < 0
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-green-500/10 text-green-400'
                  }`}>
                    {tx.type === 'purchase' || tx.amount < 0
                      ? <ArrowUpRight className="h-3.5 w-3.5" />
                      : <ArrowDownLeft className="h-3.5 w-3.5" />}
                  </div>
                  <div>
                    <p className="text-sm text-white">
                      {tx.metadata?.productTitle || tx.merchant || tx.description || tx.type || 'Transaction'}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {tx.transactionId || tx.id || ''}{tx.createdAt ? ` · ${new Date(tx.createdAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-medium ${
                    tx.type === 'purchase' || tx.amount < 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {tx.type === 'purchase' || tx.amount < 0 ? '-' : '+'}
                    {Math.abs(tx.usdcAmount || tx.amount || 0).toFixed(2)} USDC
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

/* ─── Sub-components ─── */

function LimitCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-lg font-bold text-white mt-1">{value}</p>
    </div>
  );
}

/* ─── KYC Pending: connected but verification not done ─── */

function KycPendingView({
  connectMutation,
}: {
  kycStatus: string;
  kycCheckMutation: any;
  connectMutation: any;
}) {
  const [keyInput, setKeyInput] = useState('');
  const isValidKey = keyInput.startsWith('sk_live_') || keyInput.startsWith('sk_agent_');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">Connect your Karma Card to start shopping</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        {/* Left: Create / Open Karma Account */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mb-4">
            <Wallet className="h-7 w-7 text-brand-400" />
          </div>
          <h2 className="text-base font-bold text-white">Create Karma Account</h2>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed flex-1">
            Sign up, verify your identity and create a virtual card — all on Karma.
          </p>
          <a
            href="https://agents.karmapay.xyz/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Open Karma
          </a>
        </div>

        {/* Right: Connect Existing Karma Account */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-8 flex flex-col">
          <div className="flex flex-col items-center text-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
              <Link2 className="h-7 w-7 text-emerald-400" />
            </div>
            <h2 className="text-base font-bold text-white">Connect Karma Account</h2>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed">
              Already have a Karma account? Paste your key to connect it.
            </p>
          </div>

          <div className="mt-auto space-y-3">
            <div>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk_live_... or sk_agent_..."
                className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-brand-500/50"
              />
              <p className="text-[10px] text-gray-600 mt-1.5">
                Find this in your{' '}
                <a href="https://agents.karmapay.xyz/dashboard" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400">
                  Karma dashboard
                </a>
              </p>
            </div>

            <button
              onClick={() => keyInput.trim() && connectMutation.mutate(keyInput.trim())}
              disabled={connectMutation.isPending || !isValidKey}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
            >
              {connectMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
              ) : (
                <><Link2 className="h-4 w-4" /> Connect Account</>
              )}
            </button>

            {connectMutation.isSuccess && (
              <div className="p-3 rounded-lg bg-green-500/10 text-green-400 text-sm text-center">
                <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                {connectMutation.data?.data?.data?.message || 'Karma account connected!'}
              </div>
            )}

            {connectMutation.isError && (
              <p className="text-sm text-red-400 text-center">
                {(connectMutation.error as any)?.response?.data?.error?.message || 'Invalid key or connection failed.'}
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-gray-600 text-center">
        Powered by{' '}
        <a href="https://agents.karmapay.xyz" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400">
          Karma Agent Card
        </a>
      </p>
    </div>
  );
}

/* ─── Connect View: not connected yet ─── */

function ConnectView({
  connectMutation,
}: {
  connectMutation: any;
}) {
  const [showConnect, setShowConnect] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const isValidKey = keyInput.startsWith('sk_live_') || keyInput.startsWith('sk_agent_');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">Connect your Karma Card to start shopping</p>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-5">
          <CreditCard className="h-8 w-8 text-brand-400" />
        </div>

        <h2 className="text-lg font-bold text-white">Connect Karma Card</h2>
        <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-sm mx-auto">
          Swiftbuy uses{' '}
          <a href="https://agents.karmapay.xyz" target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:text-brand-300">
            Karma
          </a>
          {' '}to give your AI agent a virtual credit card funded with USDC.
          Accepted at 150M+ merchants worldwide.
        </p>

        {!showConnect ? (
          <>
            {/* How it works */}
            <div className="mt-8 space-y-4 text-left max-w-sm mx-auto">
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-brand-500/20 text-brand-400">1</div>
                <div>
                  <p className="text-sm font-medium text-white">Create a Karma account</p>
                  <p className="text-[11px] text-gray-500">Sign up, verify your identity &amp; create a card on Karma</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-brand-500/20 text-brand-400">2</div>
                <div>
                  <p className="text-sm font-medium text-white">Get your Karma key</p>
                  <p className="text-[11px] text-gray-500">Copy your <code className="text-[10px] bg-white/5 px-1 py-0.5 rounded">sk_live_...</code> or <code className="text-[10px] bg-white/5 px-1 py-0.5 rounded">sk_agent_...</code> key from the Karma dashboard</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold bg-brand-500/20 text-brand-400">3</div>
                <div>
                  <p className="text-sm font-medium text-white">Connect it here</p>
                  <p className="text-[11px] text-gray-500">Paste your key below and you&apos;re ready to shop</p>
                </div>
              </div>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://agents.karmapay.xyz/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
              >
                <Wallet className="h-4 w-4" />
                Create Karma Account
              </a>

              <button
                onClick={() => setShowConnect(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-white font-semibold rounded-xl transition-colors"
              >
                <Link2 className="h-4 w-4" />
                I have a key
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Connect form */}
            <div className="mt-6 max-w-sm mx-auto">
              <label className="block text-left text-xs text-gray-400 font-medium mb-1.5">
                Karma Key
              </label>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk_live_... or sk_agent_..."
                className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-brand-500/50"
              />
              <p className="text-[10px] text-gray-600 mt-1.5 text-left">
                Find this in your{' '}
                <a href="https://agents.karmapay.xyz/dashboard" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400">
                  Karma dashboard
                </a>
                . Your key is stored securely and never shared.
              </p>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => keyInput.trim() && connectMutation.mutate(keyInput.trim())}
                disabled={connectMutation.isPending || !isValidKey}
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                {connectMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
                ) : (
                  <><Link2 className="h-4 w-4" /> Connect Karma Card</>
                )}
              </button>

              <button
                onClick={() => { setShowConnect(false); setKeyInput(''); }}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                ← Back
              </button>
            </div>

            {connectMutation.isSuccess && (
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
                <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                {connectMutation.data?.data?.data?.message || 'Karma card connected!'}
              </div>
            )}

            {connectMutation.isError && (
              <p className="mt-3 text-sm text-red-400">
                {(connectMutation.error as any)?.response?.data?.error?.message || 'Invalid key or connection failed. Check your key and try again.'}
              </p>
            )}
          </>
        )}

        <p className="text-[11px] text-gray-600 mt-6">
          Powered by{' '}
          <a href="https://agents.karmapay.xyz" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400">
            Karma Agent Card
          </a>
        </p>
      </div>
    </div>
  );
}
