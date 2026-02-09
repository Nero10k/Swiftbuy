'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import { Zap } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAppStore();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let res;
      if (isRegister) {
        res = await authApi.register({ email, password, name });
      } else {
        res = await authApi.login(email, password);
      }

      const { user, token } = res.data.data;
      setAuth(user, token);

      // Redirect to onboarding if new user hasn't completed it
      if (isRegister || !user.onboardingComplete) {
        router.push('/onboarding');
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-950">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-brand-600 to-brand-900 p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Swiftbuy</h1>
        </div>

        <div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            The commerce execution layer<br />for AI agents
          </h2>
          <p className="text-brand-200 mt-4 text-lg">
            Let your AI agent search, compare, and purchase anything from the web.
            Powered by USDC.
          </p>
        </div>

        <div className="flex gap-8 text-brand-300 text-sm">
          <div>
            <p className="text-3xl font-bold text-white">100%</p>
            <p>Transparent</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">USDC</p>
            <p>Native Payments</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-white">AI</p>
            <p>Agent Ready</p>
          </div>
        </div>
      </div>

      {/* Right panel — form (dark) */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Swiftbuy</h1>
          </div>

          <h2 className="text-2xl font-bold text-white">
            {isRegister ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-gray-400 mt-1 mb-8">
            {isRegister
              ? 'Sign up to start using AI-powered shopping'
              : 'Sign in to your Swiftbuy dashboard'}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="text-sm font-medium text-gray-300">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isRegister}
                  placeholder="Your name"
                  className="mt-1 w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-300">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="mt-1 w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Min. 8 characters"
                className="mt-1 w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-50 text-sm"
            >
              {loading
                ? 'Please wait...'
                : isRegister
                ? 'Create Account'
                : 'Sign In'}
            </button>
          </form>

          <p className="text-sm text-gray-500 mt-6 text-center">
            {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-brand-400 font-medium hover:text-brand-300"
            >
              {isRegister ? 'Sign in' : 'Sign up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
