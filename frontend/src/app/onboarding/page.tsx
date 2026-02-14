'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { userApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import {
  Zap,
  MapPin,
  Ruler,
  ArrowRight,
  ArrowLeft,
  Check,
} from 'lucide-react';

const STEPS = ['Shipping Address', 'About You'];

const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸', phone: '+1', zip: 'ZIP Code', zipPlaceholder: '94105', state: 'State', statePlaceholder: 'CA' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', phone: '+44', zip: 'Postcode', zipPlaceholder: 'SW1A 1AA', state: 'County', statePlaceholder: 'London' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', phone: '+31', zip: 'Postcode', zipPlaceholder: '1012 AB', state: 'Province', statePlaceholder: 'Noord-Holland' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', phone: '+49', zip: 'PLZ', zipPlaceholder: '10115', state: 'Bundesland', statePlaceholder: 'Berlin' },
  { code: 'FR', name: 'France', flag: '🇫🇷', phone: '+33', zip: 'Code Postal', zipPlaceholder: '75001', state: 'Région', statePlaceholder: 'Île-de-France' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', phone: '+1', zip: 'Postal Code', zipPlaceholder: 'M5V 3L9', state: 'Province', statePlaceholder: 'Ontario' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', phone: '+61', zip: 'Postcode', zipPlaceholder: '2000', state: 'State', statePlaceholder: 'NSW' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', phone: '+34', zip: 'Código Postal', zipPlaceholder: '28001', state: 'Province', statePlaceholder: 'Madrid' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', phone: '+39', zip: 'CAP', zipPlaceholder: '00100', state: 'Province', statePlaceholder: 'Roma' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', phone: '+351', zip: 'Código Postal', zipPlaceholder: '1000-001', state: 'District', statePlaceholder: 'Lisboa' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', phone: '+32', zip: 'Postcode', zipPlaceholder: '1000', state: 'Province', statePlaceholder: 'Brussels' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', phone: '+43', zip: 'PLZ', zipPlaceholder: '1010', state: 'Bundesland', statePlaceholder: 'Wien' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', phone: '+41', zip: 'PLZ', zipPlaceholder: '8001', state: 'Canton', statePlaceholder: 'Zürich' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', phone: '+46', zip: 'Postnummer', zipPlaceholder: '111 22', state: 'County', statePlaceholder: 'Stockholm' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', phone: '+47', zip: 'Postnummer', zipPlaceholder: '0150', state: 'County', statePlaceholder: 'Oslo' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', phone: '+45', zip: 'Postnummer', zipPlaceholder: '1050', state: 'Region', statePlaceholder: 'Hovedstaden' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', phone: '+358', zip: 'Postinumero', zipPlaceholder: '00100', state: 'Region', statePlaceholder: 'Uusimaa' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', phone: '+353', zip: 'Eircode', zipPlaceholder: 'D02 AF30', state: 'County', statePlaceholder: 'Dublin' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', phone: '+81', zip: 'Postal Code', zipPlaceholder: '100-0001', state: 'Prefecture', statePlaceholder: 'Tokyo' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', phone: '+65', zip: 'Postal Code', zipPlaceholder: '048619', state: 'District', statePlaceholder: 'Central' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', phone: '+971', zip: 'P.O. Box', zipPlaceholder: '00000', state: 'Emirate', statePlaceholder: 'Dubai' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴', phone: '+40', zip: 'Cod Poștal', zipPlaceholder: '010011', state: 'County', statePlaceholder: 'București' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', phone: '+48', zip: 'Kod Pocztowy', zipPlaceholder: '00-001', state: 'Voivodeship', statePlaceholder: 'Mazowieckie' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', phone: '+420', zip: 'PSČ', zipPlaceholder: '110 00', state: 'Region', statePlaceholder: 'Praha' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', phone: '+64', zip: 'Postcode', zipPlaceholder: '6011', state: 'Region', statePlaceholder: 'Wellington' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', phone: '+82', zip: 'Postal Code', zipPlaceholder: '04524', state: 'Province', statePlaceholder: 'Seoul' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', phone: '+972', zip: 'Postal Code', zipPlaceholder: '6100000', state: 'District', statePlaceholder: 'Tel Aviv' },
];

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
    country: '',
    phone: '',
  });

  const selectedCountry = COUNTRIES.find((c) => c.code === address.country);

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

  const handleNext = () => {
    if (step === 0) {
      if (!address.country) {
        setError('Please select your country');
        return;
      }
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
        walletAddress: undefined,
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
                <label className="text-sm font-medium text-gray-300">Country *</label>
                <select
                  value={address.country}
                  onChange={(e) => setAddress({ ...address, country: e.target.value, state: '', zipCode: '' })}
                  className={selectClass}
                >
                  <option value="">Select your country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300">Full Name *</label>
                <input
                  type="text"
                  value={address.fullName}
                  onChange={(e) => setAddress({ ...address, fullName: e.target.value })}
                  placeholder="Your full name"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-300">Street Address *</label>
                <input
                  type="text"
                  value={address.street}
                  onChange={(e) => setAddress({ ...address, street: e.target.value })}
                  placeholder="Street name, house number, apartment"
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
                    placeholder="Your city"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    {selectedCountry?.state || 'State / Province'} *
                  </label>
                  <input
                    type="text"
                    value={address.state}
                    onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    placeholder={selectedCountry?.statePlaceholder || 'State or province'}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-300">
                    {selectedCountry?.zip || 'Postal Code'} *
                  </label>
                  <input
                    type="text"
                    value={address.zipCode}
                    onChange={(e) => setAddress({ ...address, zipCode: e.target.value })}
                    placeholder={selectedCountry?.zipPlaceholder || 'Postal code'}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-300">Phone</label>
                  <div className="flex gap-2 mt-1">
                    <span className="inline-flex items-center px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-400 whitespace-nowrap">
                      {selectedCountry?.phone || '+?'}
                    </span>
                    <input
                      type="tel"
                      value={address.phone}
                      onChange={(e) => setAddress({ ...address, phone: e.target.value })}
                      placeholder="Phone number"
                      className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none"
                    />
                  </div>
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
