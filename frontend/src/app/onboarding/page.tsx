'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import {
  Zap,
  MapPin,
  Ruler,
  Wallet,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';

const STEPS = ['Shipping Address', 'About You', 'Wallet'];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, updateUser } = useAppStore();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Shipping address
  const [address, setAddress] = useState({
    fullName: user?.name || '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    phone: '',
  });

  // Profile
  const [profile, setProfile] = useState({
    gender: '',
    shirtSize: '',
    pantsSize: '',
    shoeSize: '',
    dressSize: '',
    notes: '',
    phone: '',
  });

  // Wallet
  const [walletAddress, setWalletAddress] = useState('');

  const handleNext = () => {
    if (step === 0) {
      if (!address.fullName || !address.street || !address.city || !address.state || !address.zipCode) {
        setError('Please fill in all required address fields');
        return;
      }
    }
    setError('');
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setError('');
    setStep((s) => s - 1);
  };

  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await userApi.completeOnboarding({
        shippingAddress: address,
        profile: {
          phone: profile.phone || address.phone,
          gender: profile.gender,
          shirtSize: profile.shirtSize,
          pantsSize: profile.pantsSize,
          shoeSize: profile.shoeSize,
          dressSize: profile.dressSize,
          notes: profile.notes,
        },
        walletAddress: walletAddress || undefined,
      });

      updateUser(res.data.data.user);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'mt-1 w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none';
  const selectClass =
    'mt-1 w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none [&>option]:bg-gray-900 [&>option]:text-white';

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Swiftbuy</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Set up your account</h1>
          <p className="text-gray-400 mt-1">
            Help your AI agent shop smarter for you
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((name, i) => (
            <div key={name} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i < step
                    ? 'bg-green-500 text-white'
                    : i === step
                    ? 'bg-brand-600 text-white'
                    : 'bg-white/10 text-gray-500'
                }`}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={`text-sm hidden sm:block ${
                  i === step ? 'font-medium text-white' : 'text-gray-500'
                }`}
              >
                {name}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 ${i < step ? 'bg-green-500' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white/[0.03] rounded-2xl border border-white/[0.06] p-8">
          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Step 1: Shipping Address */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-brand-500/10 text-brand-400">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Shipping Address</h2>
                  <p className="text-sm text-gray-400">Where should your purchases be delivered?</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300">Full Name *</label>
                <input
                  type="text"
                  value={address.fullName}
                  onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                  placeholder="John Doe"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300">Street Address *</label>
                <input
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  placeholder="123 Main St, Apt 4B"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">City *</label>
                  <input
                    type="text"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                    placeholder="San Francisco"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">State *</label>
                  <input
                    type="text"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    placeholder="CA"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">ZIP Code *</label>
                  <input
                    type="text"
                    value={address.zipCode}
                    onChange={(e) => setAddress({ ...address, zipCode: e.target.value })}
                    placeholder="94105"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Phone</label>
                  <input
                    type="tel"
                    value={address.phone}
                    onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                    placeholder="+1 (555) 123-4567"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: About You (Sizes + Preferences) */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                  <Ruler className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">About You</h2>
                  <p className="text-sm text-gray-400">
                    Help your AI agent find the right sizes and products
                  </p>
                </div>
              </div>

              <div className="p-3 bg-brand-500/10 border border-brand-500/20 rounded-lg text-sm text-brand-300">
                These are optional but help your agent make better purchasing decisions.
                All fields are shared with connected agents.
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300">Gender</label>
                <select
                  value={profile.gender}
                  onChange={(e) => setProfile({ ...profile, gender: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">Shirt / Top Size</label>
                  <select
                    value={profile.shirtSize}
                    onChange={(e) => setProfile({ ...profile, shirtSize: e.target.value })}
                    className={selectClass}
                  >
                    <option value="">Select</option>
                    <option value="XS">XS</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Pants / Bottom Size</label>
                  <input
                    type="text"
                    value={profile.pantsSize}
                    onChange={(e) => setProfile({ ...profile, pantsSize: e.target.value })}
                    placeholder='e.g., 32x30, M, 10'
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">Shoe Size</label>
                  <input
                    type="text"
                    value={profile.shoeSize}
                    onChange={(e) => setProfile({ ...profile, shoeSize: e.target.value })}
                    placeholder="e.g., 10, 42 EU"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Dress Size</label>
                  <input
                    type="text"
                    value={profile.dressSize}
                    onChange={(e) => setProfile({ ...profile, dressSize: e.target.value })}
                    placeholder="e.g., 8, M"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300">
                  Notes for your AI agent
                </label>
                <textarea
                  value={profile.notes}
                  onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
                  rows={3}
                  maxLength={500}
                  placeholder="Anything your AI should know: allergies, preferences, dietary restrictions, etc. E.g., 'I prefer organic products, I'm allergic to latex, I like minimalist style'"
                  className={`${inputClass} resize-none`}
                />
                <p className="text-xs text-gray-600 mt-1">
                  {profile.notes.length}/500 characters
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Wallet */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
                  <Wallet className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Connect Wallet</h2>
                  <p className="text-sm text-gray-400">
                    Link your USDC wallet to fund purchases
                  </p>
                </div>
              </div>

              <div className="p-4 bg-white/[0.03] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-semibold text-white mb-2">How it works</h3>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-start gap-2">
                    <span className="text-brand-400 font-bold mt-0.5">1.</span>
                    Your wallet holds USDC (a stablecoin pegged 1:1 to USD)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-400 font-bold mt-0.5">2.</span>
                    When your agent buys something, USDC is off-ramped to fiat automatically
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-brand-400 font-bold mt-0.5">3.</span>
                    The fiat is used to pay the retailer — you get your item delivered
                  </li>
                </ul>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300">Wallet Address</label>
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="0x... or your wallet address"
                  className={`${inputClass} font-mono`}
                />
                <p className="text-xs text-gray-600 mt-1.5">
                  Optional — you can connect your wallet later in Settings
                </p>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/5">
            {step > 0 ? (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 px-4 py-2.5 text-gray-400 text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            ) : (
              <div />
            )}

            {step < STEPS.length - 1 ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                {loading ? 'Setting up...' : 'Complete Setup'}
                <Check className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Skip */}
          {step === 1 && (
            <p className="text-center mt-4">
              <button
                onClick={handleNext}
                className="text-sm text-gray-600 hover:text-gray-400"
              >
                Skip this step
              </button>
            </p>
          )}
          {step === 2 && (
            <p className="text-center mt-4">
              <button
                onClick={handleComplete}
                disabled={loading}
                className="text-sm text-gray-600 hover:text-gray-400"
              >
                Skip and finish setup
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
