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
  ShieldOff,
  Copy,
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
  CreditCard,
  Snowflake,
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
    refetchInterval: 30000, // Refresh every 30s
  });

  // Fetch transactions
  const { data: txData, isLoading: txLoading } = useQuery({
    queryKey: ['wallet-transactions'],
    queryFn: () => walletApi.getTransactions({ limit: 20 }).then((res) => res.data.data),
    enabled: statusData?.ready === true,
  });

  // Setup mutation (new users — Karma handles KYC via SumSub link)
  const setupMutation = useMutation({
    mutationFn: () => walletApi.setup(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['wallet-status'] });
      const kycUrl = res.data.data.kycUrl;
      if (kycUrl) {
        window.open(kycUrl, '_blank');
      }
    },
  });

  // Connect existing Karma account
  const connectMutation = useMutation({
    mutationFn: (skLive: string) => walletApi.connectExisting(skLive),
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
  const isReady = statusData?.ready;
  const kycStatus = statusData?.kycStatus || 'none';

  /* ─── State: Not connected — show setup ─── */
  if (!isConnected) {
    return <SetupView setupMutation={setupMutation} connectMutation={connectMutation} />;
  }

  /* ─── State: Connected but KYC pending ─── */
  if (kycStatus !== 'approved') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Wallet</h1>
          <p className="text-sm text-gray-500 mt-1">Complete verification to start spending</p>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-5">
            <Shield className="h-8 w-8 text-yellow-400" />
          </div>
          <h2 className="text-lg font-bold text-white">Identity Verification</h2>
          <p className="text-sm text-gray-400 mt-2">
            {kycStatus === 'pending_verification'
              ? 'Complete your identity verification to activate your card.'
              : kycStatus === 'rejected'
              ? 'Your verification was rejected. Please try again or contact support.'
              : 'Start the verification process.'}
          </p>

          <div className="mt-6 space-y-3 text-left max-w-xs mx-auto">
            <StepIndicator step={1} label="Create account" description="Karma account created" done active={false} />
            <StepIndicator
              step={2}
              label="Verify identity"
              description={kycStatus === 'rejected' ? 'Verification failed' : 'ID + selfie verification'}
              done={false}
              active
              error={kycStatus === 'rejected'}
            />
            <StepIndicator step={3} label="Fund with USDC" description="Send USDC to your address" done={false} />
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            {statusData?.kycUrl && (
              <a
                href={statusData.kycUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
              >
                <ExternalLink className="h-4 w-4" />
                {kycStatus === 'rejected' ? 'Retry Verification' : 'Complete Verification'}
              </a>
            )}

            <button
              onClick={() => kycCheckMutation.mutate()}
              disabled={kycCheckMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              {kycCheckMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking...</>
              ) : (
                <><RefreshCw className="h-3.5 w-3.5" /> Check verification status</>
              )}
            </button>
          </div>

          {kycCheckMutation.isSuccess && kycCheckMutation.data?.data?.data?.kycStatus === 'approved' && (
            <div className="mt-4 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
              <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
              Verified! Your card has been created.
            </div>
          )}
        </div>
      </div>
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

function StepIndicator({
  step,
  label,
  description,
  done,
  active = false,
  error = false,
}: {
  step: number;
  label: string;
  description: string;
  done: boolean;
  active?: boolean;
  error?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        done
          ? 'bg-green-500/20 text-green-400'
          : error
          ? 'bg-red-500/20 text-red-400'
          : active
          ? 'bg-brand-500/20 text-brand-400'
          : 'bg-white/5 text-gray-600'
      }`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : error ? <AlertCircle className="h-4 w-4" /> : step}
      </div>
      <div>
        <p className={`text-sm font-medium ${done ? 'text-green-400' : error ? 'text-red-400' : active ? 'text-white' : 'text-gray-500'}`}>
          {label}
        </p>
        <p className="text-[11px] text-gray-600">{description}</p>
      </div>
    </div>
  );
}

function LimitCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-lg font-bold text-white mt-1">{value}</p>
    </div>
  );
}

function SetupView({
  setupMutation,
  connectMutation,
}: {
  setupMutation: any;
  connectMutation: any;
}) {
  const [mode, setMode] = useState<'choose' | 'new' | 'existing'>('choose');
  const [skLiveInput, setSkLiveInput] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Wallet</h1>
        <p className="text-sm text-gray-500 mt-1">Connect your Karma Agent Card to start shopping</p>
      </div>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-10 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-5">
          <CreditCard className="h-8 w-8 text-brand-400" />
        </div>

        {mode === 'choose' && (
          <>
            <h2 className="text-lg font-bold text-white">Connect Karma Wallet</h2>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-sm mx-auto">
              Karma gives your AI agent a virtual credit card funded with USDC.
              Accepted at 150M+ merchants worldwide.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-sm mx-auto">
              <button
                onClick={() => setMode('new')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-brand-500/30 hover:bg-brand-500/[0.04] transition-all"
              >
                <Wallet className="h-6 w-6 text-brand-400" />
                <span className="text-sm font-semibold text-white">New to Karma</span>
                <span className="text-[11px] text-gray-500">Create a fresh account</span>
              </button>

              <button
                onClick={() => setMode('existing')}
                className="flex flex-col items-center gap-2 p-5 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] transition-all"
              >
                <Link2 className="h-6 w-6 text-emerald-400" />
                <span className="text-sm font-semibold text-white">I have Karma</span>
                <span className="text-[11px] text-gray-500">Connect existing account</span>
              </button>
            </div>
          </>
        )}

        {mode === 'new' && (
          <>
            <h2 className="text-lg font-bold text-white">Set Up Karma Wallet</h2>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-sm mx-auto">
              We&apos;ll create your Karma account and open identity verification.
              No personal info passes through Swiftbuy — Karma handles it securely.
            </p>

            <div className="mt-6 space-y-3 text-left max-w-xs mx-auto">
              <StepIndicator step={1} label="Create account" description="We register you with Karma" done={false} active />
              <StepIndicator step={2} label="Verify identity" description="Karma opens a secure ID check" done={false} />
              <StepIndicator step={3} label="Fund with USDC" description="Send USDC to your deposit address" done={false} />
            </div>

            <div className="mt-8 flex flex-col items-center gap-3">
              <button
                onClick={() => setupMutation.mutate()}
                disabled={setupMutation.isPending}
                className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                {setupMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Setting up...</>
                ) : (
                  <><Wallet className="h-4 w-4" /> Create Karma Account</>
                )}
              </button>

              <button
                onClick={() => setMode('choose')}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                ← Back
              </button>
            </div>

            {setupMutation.isError && (
              <p className="mt-3 text-sm text-red-400">
                {(setupMutation.error as any)?.response?.data?.error?.message || 'Setup failed. Try again.'}
              </p>
            )}

            {setupMutation.isSuccess && !setupMutation.data?.data?.data?.kycUrl && (
              <div className="mt-4 p-3 rounded-lg bg-yellow-500/10 text-yellow-400 text-sm">
                <AlertCircle className="h-4 w-4 inline mr-1.5" />
                Account created but verification didn&apos;t start. Click the button again to retry.
              </div>
            )}
          </>
        )}

        {mode === 'existing' && (
          <>
            <h2 className="text-lg font-bold text-white">Connect Existing Account</h2>
            <p className="text-sm text-gray-400 mt-2 leading-relaxed max-w-sm mx-auto">
              Paste your Karma owner key to link your existing account.
              Find it in your Karma dashboard under API Keys.
            </p>

            <div className="mt-6 max-w-sm mx-auto">
              <label className="block text-left text-xs text-gray-500 font-medium mb-1.5">
                Owner Key (sk_live_...)
              </label>
              <input
                type="password"
                value={skLiveInput}
                onChange={(e) => setSkLiveInput(e.target.value)}
                placeholder="sk_live_..."
                className="w-full px-3 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white font-mono placeholder:text-gray-600 focus:outline-none focus:border-brand-500/50"
              />
              <p className="text-[10px] text-gray-600 mt-1.5 text-left">
                Your key is stored securely and never shared.
              </p>
            </div>

            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                onClick={() => skLiveInput.trim() && connectMutation.mutate(skLiveInput.trim())}
                disabled={connectMutation.isPending || !skLiveInput.startsWith('sk_live_')}
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors disabled:opacity-60"
              >
                {connectMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Connecting...</>
                ) : (
                  <><Link2 className="h-4 w-4" /> Connect Account</>
                )}
              </button>

              <button
                onClick={() => { setMode('choose'); setSkLiveInput(''); }}
                className="text-xs text-gray-500 hover:text-gray-400 transition-colors"
              >
                ← Back
              </button>
            </div>

            {connectMutation.isSuccess && (
              <div className="mt-4 p-3 rounded-lg bg-green-500/10 text-green-400 text-sm">
                <CheckCircle2 className="h-4 w-4 inline mr-1.5" />
                {connectMutation.data?.data?.data?.message || 'Karma account connected!'}
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
