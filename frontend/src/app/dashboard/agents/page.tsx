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
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">AI Agents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your OpenClaw agent connections
          </p>
        </div>
        <button
          onClick={() => {
            setShowRegister(true);
            setNewAgent(null);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Register Agent
        </button>
      </div>

      {/* Skill.md info */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400 shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-white">Skill File</h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Your OpenClaw agent reads this file to auto-discover all endpoints,
              authentication, and behavior guidelines.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-black/30 rounded-lg px-3.5 py-2 border border-white/[0.06]">
                <code className="text-xs text-gray-300 font-mono truncate">
                  {skillUrl}
                </code>
              </div>
              <button
                onClick={() => handleCopy(skillUrl, 'skillUrl')}
                className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
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
                className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Registration form */}
      {showRegister && !newAgent && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
          <h2 className="text-sm font-semibold text-white mb-1">Register New Agent</h2>
          <p className="text-xs text-gray-500 mb-4">
            Create credentials for your OpenClaw agent to connect to Swiftbuy.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Agent name (e.g., My OpenClaw Agent)"
              className="flex-1 px-4 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 outline-none"
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

      {/* Credentials (shown once) */}
      {newAgent && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/[0.03] p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-green-400">
                Agent Created: {newAgent.agentName}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Save these credentials now — they will <strong className="text-gray-300">not</strong> be shown again.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <CredField label="Agent ID" value={newAgent.agentId} field="agentId" copiedField={copiedField} onCopy={handleCopy} />
            <CredField label="User ID" value={newAgent.userId} field="userId" copiedField={copiedField} onCopy={handleCopy} />
            <CredField label="API Key" value={newAgent.apiKey} field="apiKey" copiedField={copiedField} onCopy={handleCopy} />
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Bearer Token</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 px-3.5 py-2.5 bg-black/30 border border-white/[0.06] rounded-lg text-xs font-mono text-white break-all whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {showToken ? newAgent.token : `${newAgent.token.substring(0, 30)}...`}
                </code>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => setShowToken(!showToken)} className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors" title={showToken ? 'Hide token' : 'Show full token'}>
                    {showToken ? <EyeOff className="h-3.5 w-3.5 text-gray-500" /> : <Eye className="h-3.5 w-3.5 text-gray-500" />}
                  </button>
                  <button onClick={() => handleCopy(newAgent.token, 'token')} className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors" title="Copy full token">
                    {copiedField === 'token' ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">
                {copiedField === 'token' ? '✅ Full token copied to clipboard!' : 'Click the copy button to copy the full token'}
              </p>
            </div>
          </div>

          <div className="bg-black/40 rounded-xl p-4">
            <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Add to your OpenClaw agent</p>
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
              Store these credentials securely. They cannot be retrieved later.
            </p>
          </div>

          <button
            onClick={() => { setNewAgent(null); setShowRegister(false); }}
            className="px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors"
          >
            I&apos;ve saved my credentials
          </button>
        </div>
      )}

      {/* Connected agents list */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">Connected Agents</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mx-auto" />
          </div>
        ) : data?.agents?.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Bot className="h-10 w-10 mx-auto text-gray-600 mb-3" />
            <p className="text-sm font-medium text-white">No agents connected</p>
            <p className="text-xs text-gray-500 mt-1 mb-4">
              Register an agent to start shopping autonomously
            </p>
            <button
              onClick={() => { setShowRegister(true); setNewAgent(null); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Register Agent
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {data?.agents?.map((agent: any) => (
              <div key={agent.agentId} className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${agent.isActive ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.04] text-gray-500'}`}>
                    <Bot className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{agent.agentName}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${agent.isActive ? 'bg-green-500/10 text-green-400' : 'bg-white/[0.04] text-gray-500'}`}>
                        {agent.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      <span className="font-mono">{agent.agentId}</span>
                      {' · '}Connected {formatDate(agent.connectedAt)}
                    </p>
                    {agent.permissions?.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {agent.permissions.map((perm: string) => (
                          <span key={perm} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-brand-500/10 text-brand-400 rounded-full">
                            <Shield className="h-2.5 w-2.5" />
                            {perm}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Disconnect agent "${agent.agentName}"?`)) {
                      deleteMutation.mutate(agent.agentId);
                    }
                  }}
                  className="p-2 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Disconnect agent"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          What agents can access
        </h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          The skill file teaches agents how to read your shipping addresses, clothing sizes,
          dietary preferences, allergies, and wallet balance to make purchases on your behalf.
          Agents <strong className="text-gray-400">cannot</strong> bypass approval workflows or access your password.
        </p>
      </div>
    </div>
  );
}

function CredField({ label, value, field, copiedField, onCopy }: {
  label: string; value: string; field: string; copiedField: string;
  onCopy: (text: string, field: string) => void;
}) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      <div className="flex items-center gap-2 mt-1">
        <code className="flex-1 px-3.5 py-2.5 bg-black/30 border border-white/[0.06] rounded-lg text-xs font-mono text-white">{value}</code>
        <button onClick={() => onCopy(value, field)} className="p-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.06] transition-colors">
          {copiedField === field ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5 text-gray-500" />}
        </button>
      </div>
    </div>
  );
}
