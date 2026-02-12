'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, agentApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { formatUSD } from '@/lib/utils';
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
} from 'lucide-react';
import Link from 'next/link';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

export default function DashboardPage() {
  const { user } = useAppStore();
  const queryClient = useQueryClient();

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

  // --- Register Agent ---
  const [showRegister, setShowRegister] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [newAgent, setNewAgent] = useState<any>(null);
  const [copiedField, setCopiedField] = useState('');
  const [showToken, setShowToken] = useState(false);

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

  const skillUrl = `${API_BASE}/skill.md`;
  const hasAgents = (agentsData?.agents?.length || 0) > 0;
  const stats = dashData?.user?.stats;

  return (
    <div className="space-y-10">
      {/* Welcome */}
      <div>
        <h1 className="text-xl font-semibold text-white">
          Welcome to Swiftbuy{user?.name ? `, ${user.name}` : ''}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect your AI agent and start shopping autonomously
        </p>
      </div>

      {/* ── Featured card: Connect OpenClaw ── */}
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/20 bg-gradient-to-br from-brand-600/[0.08] to-brand-800/[0.04] p-6">
        <div className="absolute top-4 right-4">
          <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-brand-500 text-white rounded-full">
            Featured
          </span>
        </div>

        <div className="flex items-start gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600/20 shrink-0">
            <Zap className="h-7 w-7 text-brand-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white">Connect OpenClaw Agent</h2>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed max-w-xl">
              Your AI assistant that shops, books, and orders on your behalf.
              Powered by Claude or GPT. Connect it in minutes using the skill.md file.
            </p>

            {/* Stats row */}
            <div className="flex items-center gap-6 mt-4">
              <div>
                <p className="text-lg font-bold text-white font-mono">skill.md</p>
                <p className="text-[11px] text-gray-500">auto-discovery</p>
              </div>
              <div>
                <p className="text-lg font-bold text-white font-mono">
                  {hasAgents ? agentsData.agents.length : '0'}
                </p>
                <p className="text-[11px] text-gray-500">agents connected</p>
              </div>
              <div>
                <p className="text-lg font-bold text-white font-mono">5 min</p>
                <p className="text-[11px] text-gray-500">to connect</p>
              </div>
            </div>
          </div>

          <Link
            href="#get-started"
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-xl hover:bg-brand-500 transition-colors shrink-0 self-center"
          >
            Get Started
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* ── Quick access cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/dashboard/chat"
          className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
            <MessageCircle className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Chat with Swiftbuy</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Search, shop, and book through conversation
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </Link>

        <Link
          href="/dashboard/wallet"
          className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 hover:bg-white/[0.04] transition-colors"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
            <Wallet className="h-5 w-5 text-gray-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">Wallet</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {user?.walletAddress ? 'View your USDC balance' : 'Connect your USDC wallet'}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
        </Link>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
              <ShoppingCart className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{stats?.totalOrders || 0}</p>
              <p className="text-[11px] text-gray-500">Total Orders</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
              <Wallet className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{formatUSD(stats?.totalSpent || 0)}</p>
              <p className="text-[11px] text-gray-500">Total Spent</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
              <Bot className="h-4 w-4 text-gray-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-white">{agentsData?.agents?.length || 0}</p>
              <p className="text-[11px] text-gray-500">Active Agents</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Inline Agent Registration ── */}
      {!newAgent && (
        <div id="get-started" className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="p-6 border-b border-white/[0.06]">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                  Register an Agent
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Create credentials so your OpenClaw agent can connect via skill.md
                </p>
              </div>
              {!showRegister && (
                <button
                  onClick={() => setShowRegister(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New Agent
                </button>
              )}
            </div>
          </div>

          {showRegister && (
            <div className="p-6">
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
            </div>
          )}

          {/* Connected agents preview */}
          {!showRegister && hasAgents && (
            <div className="divide-y divide-white/[0.04]">
              {agentsData.agents.slice(0, 3).map((agent: any) => (
                <div key={agent.agentId} className="flex items-center justify-between px-6 py-4">
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
              {agentsData.agents.length > 3 && (
                <Link
                  href="/dashboard/agents"
                  className="flex items-center justify-center gap-1 px-6 py-3 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  View all {agentsData.agents.length} agents
                  <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          )}

          {!showRegister && !hasAgents && !agentsLoading && (
            <div className="px-6 py-10 text-center">
              <Bot className="h-10 w-10 mx-auto text-gray-600 mb-3" />
              <p className="text-sm text-gray-400">No agents connected yet</p>
              <p className="text-xs text-gray-500 mt-1">Register your first agent to get started</p>
            </div>
          )}
        </div>
      )}

      {/* ── New Agent Credentials (shown once) ── */}
      {newAgent && (
        <div id="get-started" className="rounded-2xl border border-green-500/20 bg-green-500/[0.03] p-6 space-y-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-green-400">
                Agent Created: {newAgent.agentName}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">
                Save these credentials now — they will <strong className="text-gray-300">not</strong> be shown again.
              </p>
            </div>
          </div>

          {/* Credential fields */}
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
                    title={showToken ? 'Hide token' : 'Show full token'}
                  >
                    {showToken ? <EyeOff className="h-3.5 w-3.5 text-gray-500" /> : <Eye className="h-3.5 w-3.5 text-gray-500" />}
                  </button>
                  <button
                    onClick={() => handleCopy(newAgent.token, 'token')}
                    className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
                    title="Copy full token"
                  >
                    {copiedField === 'token' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                {copiedField === 'token' ? '✅ Full token copied to clipboard!' : 'Click the copy button to copy the full token'}
              </p>
            </div>
          </div>

          {/* Skill.md snippet */}
          <div className="bg-black/40 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">
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
                title="Copy all"
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
      )}

      {/* ── Skill.md URL bar ── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Skill File URL
          </p>
          <a
            href={skillUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
          >
            View file <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 bg-black/30 rounded-lg px-4 py-2.5 border border-white/[0.06]">
            <code className="text-sm text-gray-300 font-mono truncate flex-1">
              {skillUrl}
            </code>
          </div>
          <button
            onClick={() => handleCopy(skillUrl, 'skillUrl')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] text-sm text-gray-300 transition-colors"
          >
            {copiedField === 'skillUrl' ? (
              <><Check className="h-3.5 w-3.5 text-green-400" /> Copied</>
            ) : (
              <><Copy className="h-3.5 w-3.5" /> Copy</>
            )}
          </button>
        </div>
      </div>

      {/* ── Getting Started Steps ── */}
      <div>
        <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-4">
          Getting Started with Swiftbuy
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StepCard
            number={1}
            title="Register Your Agent"
            description="Create credentials above to get your Bearer token and API key"
            done={hasAgents}
          />
          <StepCard
            number={2}
            title="Add Skill File"
            description="Point your OpenClaw agent at the skill.md URL to auto-discover endpoints"
            done={false}
          />
          <StepCard
            number={3}
            title="Start Shopping"
            description="Your agent reads your profile, finds products, and handles checkout"
            done={false}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Helper Components ─── */

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

function StepCard({
  number,
  title,
  description,
  done,
}: {
  number: number;
  title: string;
  description: string;
  done: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shrink-0 ${
            done
              ? 'bg-green-500/10 text-green-400'
              : 'bg-brand-500/10 text-brand-400'
          }`}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : number}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}
