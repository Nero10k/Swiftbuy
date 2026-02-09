'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import {
  Bot,
  Plus,
  Copy,
  Check,
  Trash2,
  Key,
  Shield,
  AlertTriangle,
  Eye,
  EyeOff,
  FileText,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3000';

export default function AgentsPage() {
  const queryClient = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [newAgent, setNewAgent] = useState<any>(null);
  const [copiedField, setCopiedField] = useState('');
  const [showToken, setShowToken] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => agentApi.getAgents().then((res) => res.data.data),
  });

  const registerMutation = useMutation({
    mutationFn: (data: { agentName: string }) => agentApi.registerAgent(data),
    onSuccess: (res) => {
      setNewAgent(res.data.data);
      setAgentName('');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (agentId: string) => agentApi.deleteAgent(agentId),
    onSuccess: () => {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Agents</h1>
          <p className="text-gray-400 mt-1">
            Connect AI agents via OpenClaw&apos;s skill system
          </p>
        </div>
        <button
          onClick={() => {
            setShowRegister(true);
            setNewAgent(null);
          }}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Agent
        </button>
      </div>

      {/* Skill.md info card */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-white/5 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-brand-500/10 text-brand-400 shrink-0">
            <FileText className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white">
              Connect via skill.md
            </h2>
            <p className="text-sm text-gray-400 mt-1 leading-relaxed">
              Swiftbuy exposes a <code className="text-brand-400 bg-white/5 px-1 py-0.5 rounded text-xs">skill.md</code> file
              that your OpenClaw agent reads to learn all available endpoints, authentication,
              and behavior guidelines. Register an agent below to get your token, then point
              your agent at the skill file.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 flex items-center gap-2 bg-black/30 rounded-lg px-4 py-2.5 border border-white/10">
                <code className="text-sm text-gray-300 font-mono truncate">
                  {skillUrl}
                </code>
                <button
                  onClick={() => handleCopy(skillUrl, 'skillUrl')}
                  className="p-1.5 rounded-md hover:bg-white/10 transition-colors shrink-0"
                >
                  {copiedField === 'skillUrl' ? (
                    <Check className="h-3.5 w-3.5 text-green-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-gray-500" />
                  )}
                </button>
              </div>
              <a
                href={skillUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View
              </a>
            </div>

            {/* How it works steps */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-brand-400 font-semibold mb-1">Step 1</p>
                <p className="text-sm text-gray-300">Register an agent below and get your Bearer token</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-brand-400 font-semibold mb-1">Step 2</p>
                <p className="text-sm text-gray-300">
                  Add the skill.md URL to your OpenClaw agent&apos;s skills
                </p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                <p className="text-xs text-brand-400 font-semibold mb-1">Step 3</p>
                <p className="text-sm text-gray-300">Your agent reads the skill and can start shopping</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* New agent registration */}
      {showRegister && !newAgent && (
        <div className="bg-white/[0.03] rounded-xl border border-white/5 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Register New Agent</h2>
          <p className="text-sm text-gray-400 mb-4">
            Create credentials for your OpenClaw agent to connect to Swiftbuy.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent name (e.g., My OpenClaw Agent)"
              className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
            />
            <button
              onClick={handleRegister}
              disabled={registerMutation.isPending || !agentName.trim()}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50"
            >
              {registerMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => setShowRegister(false)}
              className="px-4 py-2.5 text-gray-400 text-sm rounded-lg hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* New agent credentials (shown once!) */}
      {newAgent && (
        <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-6">
          <div className="flex items-start gap-3 mb-4">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-green-400">
                Agent Created: {newAgent.agentName}
              </h2>
              <p className="text-sm text-green-300/70 mt-1">
                Save these credentials now — they will <strong>not</strong> be shown again.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Agent ID */}
            <div>
              <label className="text-xs font-semibold text-green-400 uppercase">Agent ID</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-white">
                  {newAgent.agentId}
                </code>
                <button
                  onClick={() => handleCopy(newAgent.agentId, 'agentId')}
                  className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {copiedField === 'agentId' ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>

            {/* API Key */}
            <div>
              <label className="text-xs font-semibold text-green-400 uppercase">API Key</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-white">
                  {newAgent.apiKey}
                </code>
                <button
                  onClick={() => handleCopy(newAgent.apiKey, 'apiKey')}
                  className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {copiedField === 'apiKey' ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>

            {/* Bearer Token */}
            <div>
              <label className="text-xs font-semibold text-green-400 uppercase">
                Bearer Token (use in Authorization header)
              </label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-white overflow-hidden">
                  {showToken
                    ? newAgent.token
                    : `${newAgent.token.substring(0, 30)}...`}
                </code>
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-500" />
                  )}
                </button>
                <button
                  onClick={() => handleCopy(newAgent.token, 'token')}
                  className="p-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {copiedField === 'token' ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-500" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Skill.md setup instructions */}
          <div className="mt-6 bg-black/30 rounded-xl p-5 overflow-x-auto">
            <p className="text-xs text-gray-400 mb-3 font-semibold uppercase">
              Add to your OpenClaw agent
            </p>
            <pre className="text-sm font-mono text-gray-300 leading-relaxed">
{`# In your OpenClaw agent config, add this skill:

skill_url: ${skillUrl}

# Set the environment variable for auth:
AGENT_TOKEN=${showToken ? newAgent.token : newAgent.token.substring(0, 20) + '...'}`}
            </pre>
            <p className="text-xs text-gray-500 mt-3">
              Your agent reads the skill.md to learn all endpoints, request formats, and behavior guidelines automatically.
            </p>
          </div>

          <div className="flex items-center gap-2 mt-4 p-3 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-yellow-400 shrink-0" />
            <p className="text-sm text-yellow-300/80">
              Store these credentials securely. The API key and token cannot be retrieved later.
            </p>
          </div>

          <button
            onClick={() => {
              setNewAgent(null);
              setShowRegister(false);
            }}
            className="mt-4 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors"
          >
            I&apos;ve saved my credentials
          </button>
        </div>
      )}

      {/* Connected agents list */}
      <div className="bg-white/[0.03] rounded-xl border border-white/5">
        <div className="p-6 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">Connected Agents</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent mx-auto" />
          </div>
        ) : data?.agents?.length === 0 ? (
          <div className="p-12 text-center">
            <Bot className="h-12 w-12 mx-auto text-gray-600 mb-3" />
            <h3 className="text-lg font-medium text-white">No agents connected</h3>
            <p className="text-gray-400 mt-1 mb-4">
              Register an OpenClaw agent to start shopping autonomously
            </p>
            <button
              onClick={() => {
                setShowRegister(true);
                setNewAgent(null);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Register Your First Agent
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {data?.agents?.map((agent: any) => (
              <div
                key={agent.agentId}
                className="flex items-center justify-between p-5 px-6"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`p-2.5 rounded-xl ${
                      agent.isActive
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-white/5 text-gray-500'
                    }`}
                  >
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-white">{agent.agentName}</p>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          agent.isActive
                            ? 'bg-green-500/10 text-green-400'
                            : 'bg-white/5 text-gray-500'
                        }`}
                      >
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      <span className="font-mono">{agent.agentId}</span>
                      {' · '}
                      Connected {formatDate(agent.connectedAt)}
                    </p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {agent.permissions?.map((perm: string) => (
                        <span
                          key={perm}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-brand-500/10 text-brand-400 rounded-full"
                        >
                          <Shield className="h-3 w-3" />
                          {perm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {agent.stats?.totalSearches > 0 && (
                    <div className="text-right text-sm mr-4">
                      <p className="text-white font-medium">
                        {agent.stats.totalSearches} searches
                      </p>
                      <p className="text-gray-500">
                        {agent.stats.totalPurchases} purchases
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (confirm(`Disconnect agent "${agent.agentName}"?`)) {
                        deleteMutation.mutate(agent.agentId);
                      }
                    }}
                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title="Disconnect agent"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info: What agents can access */}
      <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-blue-400 mb-2">
          What does the skill.md give agents access to?
        </h3>
        <p className="text-sm text-blue-300/70 leading-relaxed">
          The skill file teaches agents how to read your <strong className="text-blue-300">shipping addresses</strong>,{' '}
          <strong className="text-blue-300">clothing sizes</strong>, <strong className="text-blue-300">dietary preferences</strong>,{' '}
          <strong className="text-blue-300">allergies</strong>, and <strong className="text-blue-300">wallet balance</strong> to make purchases on your behalf.
          It also includes behavior guidelines — agents must present options before buying,
          mention prices clearly, and respect your spending limits. Agents{' '}
          <strong className="text-blue-300">cannot</strong> bypass approval workflows or access your password.
        </p>
      </div>
    </div>
  );
}
