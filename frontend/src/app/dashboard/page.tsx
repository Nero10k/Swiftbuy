'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, agentApi, walletApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { formatUSD, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import {
  Zap,
  Copy,
  Check,
  ExternalLink,
  Plus,
  ChevronRight,
  ShoppingCart,
  MessageCircle,
  Wallet,
  Bot,
  Eye,
  EyeOff,
  AlertTriangle,
  Key,
  ArrowRight,
  ArrowUpRight,
  ArrowDownLeft,
  CreditCard,
  TrendingUp,
  Clock,
  Package,
  RefreshCw,
  CheckCircle2,
  Circle,
} from 'lucide-react';
import Link from 'next/link';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

export default function DashboardPage() {
  const { user } = useAppStore();
  const queryClient = useQueryClient();
  const firstName = user?.name?.split(' ')[0] || '';

  // --- Agents data ---
  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentApi.getAgents().then((res) => res.data.data),
  });

  // --- Dashboard data ---
  const { data: dashData } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => userApi.getDashboard().then((res) => res.data.data),
  });

  // --- Wallet status ---
  const { data: walletStatus } = useQuery({
    queryKey: ['wallet-status'],
    queryFn: () => walletApi.getStatus().then((res) => res.data.data),
  });

  // --- Wallet balance (only when wallet ready) ---
  const { data: balanceData, refetch: refetchBalance } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: () => walletApi.getBalance().then((res) => res.data.data),
    enabled: walletStatus?.ready === true,
    refetchInterval: 30000,
  });

  // --- Computed state ---
  const hasAgents = (agentsData?.agents?.length || 0) > 0;
  const walletConnected = walletStatus?.connected === true;
  const walletReady = walletStatus?.ready === true;
  const stats = dashData?.user?.stats;
  const hasOrders = (stats?.totalOrders || 0) > 0;
  const recentOrders = dashData?.recentOrders || [];
  const pendingApprovals = dashData?.pendingApprovals || [];
  const allSetUp = hasAgents && walletConnected;

  // ─── SETUP MODE vs ACTIVE MODE ───
  if (!allSetUp) {
    return (
      <SetupView
        firstName={firstName}
        hasAgents={hasAgents}
        agentsData={agentsData}
        agentsLoading={agentsLoading}
        walletConnected={walletConnected}
        walletReady={walletReady}
        hasOrders={hasOrders}
      />
    );
  }

  return (
    <ActiveView
      firstName={firstName}
      hasAgents={hasAgents}
      agentsData={agentsData}
      walletReady={walletReady}
      balanceData={balanceData}
      refetchBalance={refetchBalance}
      stats={stats}
      recentOrders={recentOrders}
      pendingApprovals={pendingApprovals}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   SETUP VIEW — 3-step onboarding guide
   ═══════════════════════════════════════════════════════════════════════ */

function SetupView({
  firstName,
  hasAgents,
  agentsData,
  agentsLoading,
  walletConnected,
  walletReady,
  hasOrders,
}: {
  firstName: string;
  hasAgents: boolean;
  agentsData: any;
  agentsLoading: boolean;
  walletConnected: boolean;
  walletReady: boolean;
  hasOrders: boolean;
}) {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [newAgent, setNewAgent] = useState<any>(null);
  const [copiedField, setCopiedField] = useState('');
  const [showToken, setShowToken] = useState(false);
  const skillUrl = `${API_BASE}/skill.md`;

  const registerMutation = useMutation({
    mutationFn: (data: { agentName: string }) => agentApi.registerAgent(data),
    onSuccess: (res) => {
      setNewAgent(res.data.data);
      setAgentName('');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  };

  const handleRegister = () => {
    if (!agentName.trim()) return;
    registerMutation.mutate({ agentName: agentName.trim() });
  };

  // Determine which step is current
  // Stay on step 1 while credentials are being shown so the user can copy them
  const currentStep = (!hasAgents || newAgent) ? 1 : !walletConnected ? 2 : 3;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white">
          Welcome{firstName ? `, ${firstName}` : ''} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Let&apos;s get you set up in 3 steps
        </p>
      </div>

      {/* ─── Step 1: Connect AI Agent ─── */}
      <SetupStep
        number={1}
        title="Connect AI agent"
        subtitle="Add skill.md to your OpenClaw agent"
        done={hasAgents}
        current={currentStep === 1}
      >
        {/* Expanded content for step 1 */}
        {currentStep === 1 && !newAgent && (
          <div className="mt-4 space-y-4">
            {/* Skill.md URL */}
            <div className="bg-black/30 rounded-xl p-4 border border-white/[0.04]">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                1. Add this skill file to your agent
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-black/40 border border-white/[0.06] rounded-lg text-xs font-mono text-gray-300 truncate">
                  {skillUrl}
                </code>
                <button
                  onClick={() => handleCopy(skillUrl, 'skillUrl')}
                  className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors shrink-0"
                >
                  {copiedField === 'skillUrl' ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-gray-500" />
                  )}
                </button>
                <a
                  href={skillUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
                </a>
              </div>
            </div>

            {/* Register agent */}
            <div className="bg-black/30 rounded-xl p-4 border border-white/[0.04]">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                2. Create agent credentials
              </p>
              {!showRegister ? (
                <button
                  onClick={() => setShowRegister(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Register Agent
                </button>
              ) : (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="Agent name (e.g., My OpenClaw Agent)"
                    className="flex-1 px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 outline-none transition-colors"
                    onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                    autoFocus
                  />
                  <button
                    onClick={handleRegister}
                    disabled={registerMutation.isPending || !agentName.trim()}
                    className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-40"
                  >
                    {registerMutation.isPending ? 'Creating...' : 'Create'}
                  </button>
                  <button
                    onClick={() => setShowRegister(false)}
                    className="px-4 py-2.5 text-gray-400 text-sm rounded-lg hover:bg-white/[0.04] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Already have agents */}
            {!showRegister && hasAgents && (
              <div className="text-xs text-gray-500">
                You already have {agentsData?.agents?.length} agent(s) connected.
              </div>
            )}
          </div>
        )}

        {/* New agent credentials */}
        {currentStep === 1 && newAgent && (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-green-500/20 bg-green-500/[0.03] p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
                  <Key className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-green-400">
                    Agent Created: {newAgent.agentName}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Save these credentials now — they will <strong className="text-gray-300">not</strong> be shown again.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <CredentialField label="Agent ID" value={newAgent.agentId} field="agentId" copiedField={copiedField} onCopy={handleCopy} />
                <CredentialField label="User ID" value={newAgent.userId} field="userId" copiedField={copiedField} onCopy={handleCopy} />
                <CredentialField label="API Key" value={newAgent.apiKey} field="apiKey" copiedField={copiedField} onCopy={handleCopy} />
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                    Bearer Token
                  </label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 px-3.5 py-2.5 bg-black/30 border border-white/[0.06] rounded-lg text-xs font-mono text-white break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                      {showToken ? newAgent.token : `${newAgent.token.substring(0, 30)}...`}
                    </code>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => setShowToken(!showToken)}
                        className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                      >
                        {showToken ? <EyeOff className="h-3.5 w-3.5 text-gray-500" /> : <Eye className="h-3.5 w-3.5 text-gray-500" />}
                      </button>
                      <button
                        onClick={() => handleCopy(newAgent.token, 'token')}
                        className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                      >
                        {copiedField === 'token' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick copy for agent config */}
              <div className="bg-black/40 rounded-lg p-3">
                <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">
                  Add to your OpenClaw agent
                </p>
                <div className="relative">
                  <pre className="text-xs font-mono text-gray-300 leading-relaxed break-all whitespace-pre-wrap">
{`skill_url: ${skillUrl}
AGENT_TOKEN=${newAgent.token}`}
                  </pre>
                  <button
                    onClick={() => handleCopy(`skill_url: ${skillUrl}\nAGENT_TOKEN=${newAgent.token}`, 'agentConfig')}
                    className="absolute top-0 right-0 p-1.5 rounded-lg border border-white/[0.06] bg-black/50 hover:bg-white/[0.06] transition-colors"
                  >
                    {copiedField === 'agentConfig' ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-gray-500" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-yellow-500/[0.03] border border-yellow-500/10 rounded-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                <p className="text-xs text-yellow-300/80">
                  Store these credentials securely. The API key and token cannot be retrieved later.
                </p>
              </div>

              <button
                onClick={() => {
                  setNewAgent(null);
                  setShowRegister(false);
                }}
                className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors"
              >
                I&apos;ve saved my credentials
              </button>
            </div>
          </div>
        )}

        {/* Step 1 done — show connected agent(s) */}
        {hasAgents && currentStep !== 1 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Bot className="h-3.5 w-3.5 text-green-400" />
            <span>
              {agentsData.agents.length} agent{agentsData.agents.length > 1 ? 's' : ''} connected
            </span>
          </div>
        )}
      </SetupStep>

      {/* ─── Step 2: Set up wallet ─── */}
      <SetupStep
        number={2}
        title="Set up wallet"
        subtitle="Connect Karma to fund purchases"
        done={walletConnected}
        current={currentStep === 2}
      >
        {currentStep === 2 && (
          <div className="mt-4">
            <Link
              href="/dashboard/wallet"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
            >
              <Wallet className="h-4 w-4" />
              Set up Karma Wallet
              <ArrowRight className="h-4 w-4" />
            </Link>
            <p className="text-xs text-gray-600 mt-2">
              Connect your existing Karma account or create a new one
            </p>
          </div>
        )}
        {walletConnected && currentStep !== 2 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Wallet className="h-3.5 w-3.5 text-green-400" />
            <span>Karma wallet connected</span>
          </div>
        )}
      </SetupStep>

      {/* ─── Step 3: Start shopping ─── */}
      <SetupStep
        number={3}
        title="Start shopping"
        subtitle="Ask your agent to buy anything"
        done={hasOrders}
        current={currentStep === 3}
      >
        {currentStep === 3 && (
          <div className="mt-4 flex items-center gap-3">
            <Link
              href="/dashboard/chat"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Chat with Swiftbuy
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="text-xs text-gray-600">or ask your OpenClaw agent directly</span>
          </div>
        )}
      </SetupStep>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   ACTIVE VIEW — Full dashboard after setup complete
   ═══════════════════════════════════════════════════════════════════════ */

function ActiveView({
  firstName,
  hasAgents,
  agentsData,
  walletReady,
  balanceData,
  refetchBalance,
  stats,
  recentOrders,
  pendingApprovals,
}: {
  firstName: string;
  hasAgents: boolean;
  agentsData: any;
  walletReady: boolean;
  balanceData: any;
  refetchBalance: () => void;
  stats: any;
  recentOrders: any[];
  pendingApprovals: any[];
}) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Welcome back{firstName ? `, ${firstName}` : ''} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Here&apos;s what&apos;s happening with your account
          </p>
        </div>
        <Link
          href="/dashboard/chat"
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-500 transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          Start Shopping
        </Link>
      </div>

      {/* ── Pending Approvals Banner ── */}
      {pendingApprovals.length > 0 && (
        <Link
          href="/dashboard/orders"
          className="flex items-center gap-4 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/[0.04] hover:bg-yellow-500/[0.06] transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10 shrink-0">
            <Clock className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-300">
              {pendingApprovals.length} order{pendingApprovals.length > 1 ? 's' : ''} waiting for approval
            </p>
            <p className="text-xs text-yellow-400/60 mt-0.5">
              Review and approve or reject pending purchases
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-yellow-400/60" />
        </Link>
      )}

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Wallet Balance */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-500/10">
              <Wallet className="h-4 w-4 text-green-400" />
            </div>
            <button
              onClick={() => refetchBalance()}
              className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors"
              title="Refresh balance"
            >
              <RefreshCw className="h-3 w-3 text-gray-600" />
            </button>
          </div>
          <p className="text-xl font-bold text-white font-mono">
            {walletReady ? `$${(balanceData?.balance || 0).toFixed(2)}` : '—'}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5">USDC Balance</p>
        </div>

        {/* Total Orders */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <Package className="h-4 w-4 text-blue-400" />
            </div>
          </div>
          <p className="text-xl font-bold text-white">{stats?.totalOrders || 0}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Total Orders</p>
        </div>

        {/* Total Spent */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <TrendingUp className="h-4 w-4 text-purple-400" />
            </div>
          </div>
          <p className="text-xl font-bold text-white">{formatUSD(stats?.totalSpent || 0)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Total Spent</p>
        </div>

        {/* Active Agents */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/10">
              <Bot className="h-4 w-4 text-brand-400" />
            </div>
          </div>
          <p className="text-xl font-bold text-white">{agentsData?.agents?.length || 0}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">Active Agents</p>
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/dashboard/chat"
          className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600/10">
            <MessageCircle className="h-5 w-5 text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Chat</p>
            <p className="text-xs text-gray-500 mt-0.5">Search &amp; shop</p>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </Link>

        <Link
          href="/dashboard/wallet"
          className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10">
            <CreditCard className="h-5 w-5 text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Wallet</p>
            <p className="text-xs text-gray-500 mt-0.5">Balance &amp; card</p>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </Link>

        <Link
          href="/dashboard/orders"
          className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <Package className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Orders</p>
            <p className="text-xs text-gray-500 mt-0.5">Track purchases</p>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </Link>
      </div>

      {/* ── Recent Orders ── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.04]">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
            Recent Orders
          </h2>
          <Link
            href="/dashboard/orders"
            className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ShoppingCart className="h-10 w-10 mx-auto text-gray-700 mb-3" />
            <p className="text-sm text-gray-400">No orders yet</p>
            <p className="text-xs text-gray-600 mt-1">
              Ask your agent to find and buy something, or{' '}
              <Link href="/dashboard/chat" className="text-brand-400 hover:underline">
                chat with Swiftbuy
              </Link>
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {recentOrders.slice(0, 5).map((order: any) => (
              <div key={order.orderId} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] shrink-0">
                    <Package className="h-4 w-4 text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {order.product?.title || 'Untitled Order'}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] text-gray-500">
                        {order.product?.retailer && `${order.product.retailer} · `}
                        {formatDate(order.createdAt)}
                      </p>
                      {order.product?.url && (
                        <a
                          href={order.product.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-brand-400/60 hover:text-brand-400 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          <span>View</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <span className="text-sm font-medium text-white font-mono">
                    {formatUSD(order.payment?.amount || 0)}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getStatusColor(order.status)}`}>
                    {getStatusLabel(order.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Active Agents ── */}
      {hasAgents && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-white/[0.04]">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
              Connected Agents
            </h2>
            <Link
              href="/dashboard/agents"
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors flex items-center gap-1"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {agentsData.agents.slice(0, 3).map((agent: any) => (
              <div key={agent.agentId} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10">
                    <Bot className="h-4 w-4 text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{agent.agentName}</p>
                    <p className="text-[11px] text-gray-500 font-mono">{agent.agentId}</p>
                  </div>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════════════════════ */

function SetupStep({
  number,
  title,
  subtitle,
  done,
  current,
  children,
}: {
  number: number;
  title: string;
  subtitle: string;
  done: boolean;
  current: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 transition-all ${
        done
          ? 'border-green-500/20 bg-green-500/[0.02]'
          : current
          ? 'border-brand-500/30 bg-brand-600/[0.04]'
          : 'border-white/[0.04] bg-white/[0.01] opacity-50'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Step indicator */}
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold shrink-0 ${
            done
              ? 'bg-green-500/15 text-green-400'
              : current
              ? 'bg-brand-500/15 text-brand-400'
              : 'bg-white/[0.04] text-gray-600'
          }`}
        >
          {done ? <CheckCircle2 className="h-5 w-5" /> : number}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3
              className={`text-base font-semibold ${
                done ? 'text-green-400' : current ? 'text-white' : 'text-gray-500'
              }`}
            >
              {title}
            </h3>
            {done && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 font-medium">
                Complete
              </span>
            )}
            {current && !done && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 font-medium animate-pulse">
                Current
              </span>
            )}
          </div>
          <p className={`text-sm mt-1 ${done ? 'text-green-400/50' : current ? 'text-gray-400' : 'text-gray-600'}`}>
            {subtitle}
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

function CredentialField({
  label,
  value,
  field,
  copiedField,
  onCopy,
}: {
  label: string;
  value: string;
  field: string;
  copiedField: string;
  onCopy: (text: string, field: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        {label}
      </label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 px-3.5 py-2.5 bg-black/30 border border-white/[0.06] rounded-lg text-xs font-mono text-white">
          {value}
        </code>
        <button
          onClick={() => onCopy(value, field)}
          className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
        >
          {copiedField === field ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-gray-500" />
          )}
        </button>
      </div>
    </div>
  );
}
