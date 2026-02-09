'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Save, Wallet, Shield, MapPin } from 'lucide-react';

export default function SettingsPage() {
  const { user, updateUser } = useAppStore();
  const queryClient = useQueryClient();

  const [spendingLimits, setSpendingLimits] = useState({
    daily: user?.preferences?.spendingLimit?.daily || 500,
    monthly: user?.preferences?.spendingLimit?.monthly || 5000,
  });

  const [autoApproveLimit, setAutoApproveLimit] = useState(
    user?.preferences?.maxAutoApprove || 25
  );

  const [requireApproval, setRequireApproval] = useState(
    user?.preferences?.requireApproval ?? true
  );

  const [walletAddress, setWalletAddress] = useState(user?.walletAddress || '');

  const settingsMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => userApi.updateSettings(data),
    onSuccess: (res) => {
      updateUser(res.data.data.user);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const walletMutation = useMutation({
    mutationFn: (address: string) => userApi.connectWallet(address),
    onSuccess: () => {
      updateUser({ walletAddress } as any);
    },
  });

  const handleSaveSettings = () => {
    settingsMutation.mutate({
      preferences: {
        maxAutoApprove: autoApproveLimit,
        spendingLimit: spendingLimits,
        requireApproval,
      },
    });
  };

  const handleConnectWallet = () => {
    if (walletAddress.trim()) {
      walletMutation.mutate(walletAddress.trim());
    }
  };

  const inputClass =
    'w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none';

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 mt-1">Manage your account and shopping preferences</p>
      </div>

      {/* Wallet Connection */}
      <section className="bg-white/[0.03] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Wallet</h2>
            <p className="text-sm text-gray-400">Connect your USDC wallet address</p>
          </div>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0x... or wallet address"
            className={`${inputClass} flex-1 font-mono`}
          />
          <button
            onClick={handleConnectWallet}
            disabled={walletMutation.isPending}
            className="px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50"
          >
            {walletMutation.isPending ? 'Connecting...' : user?.walletAddress ? 'Update' : 'Connect'}
          </button>
        </div>
        {walletMutation.isSuccess && (
          <p className="text-sm text-green-400 mt-2">Wallet connected successfully!</p>
        )}
      </section>

      {/* Approval Settings */}
      <section className="bg-white/[0.03] rounded-xl border border-white/5 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Purchase Controls</h2>
            <p className="text-sm text-gray-400">Control how your AI agents make purchases</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Require approval toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Require Approval</p>
              <p className="text-xs text-gray-500">AI agents must get your approval before purchasing</p>
            </div>
            <button
              onClick={() => setRequireApproval(!requireApproval)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                requireApproval ? 'bg-brand-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  requireApproval ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Auto-approve threshold */}
          <div>
            <label className="text-sm font-medium text-white">
              Auto-approve purchases below
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Orders under this amount will be automatically approved
            </p>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">$</span>
              <input
                type="number"
                value={autoApproveLimit}
                onChange={(e) => setAutoApproveLimit(Number(e.target.value))}
                min={0}
                max={1000}
                className={`${inputClass} w-32`}
              />
            </div>
          </div>

          {/* Spending limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-white">Daily Spending Limit</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={spendingLimits.daily}
                  onChange={(e) =>
                    setSpendingLimits((s) => ({ ...s, daily: Number(e.target.value) }))
                  }
                  min={0}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-white">Monthly Spending Limit</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500">$</span>
                <input
                  type="number"
                  value={spendingLimits.monthly}
                  onChange={(e) =>
                    setSpendingLimits((s) => ({ ...s, monthly: Number(e.target.value) }))
                  }
                  min={0}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={settingsMutation.isPending}
          className="mt-6 flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {settingsMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
        {settingsMutation.isSuccess && (
          <p className="text-sm text-green-400 mt-2">Settings saved!</p>
        )}
      </section>
    </div>
  );
}
