'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import { useAppStore } from '@/lib/store';
import {
  Save,
  Wallet,
  Shield,
  MapPin,
  User,
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Star,
} from 'lucide-react';

const COUNTRIES = [
  { code: 'US', name: 'United States', flag: '🇺🇸', phone: '+1', zip: 'ZIP Code', state: 'State' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', phone: '+44', zip: 'Postcode', state: 'County' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱', phone: '+31', zip: 'Postcode', state: 'Province' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', phone: '+49', zip: 'PLZ', state: 'Bundesland' },
  { code: 'FR', name: 'France', flag: '🇫🇷', phone: '+33', zip: 'Code Postal', state: 'Région' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', phone: '+1', zip: 'Postal Code', state: 'Province' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', phone: '+61', zip: 'Postcode', state: 'State' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸', phone: '+34', zip: 'Código Postal', state: 'Province' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹', phone: '+39', zip: 'CAP', state: 'Province' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', phone: '+351', zip: 'Código Postal', state: 'District' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪', phone: '+32', zip: 'Postcode', state: 'Province' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹', phone: '+43', zip: 'PLZ', state: 'Bundesland' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭', phone: '+41', zip: 'PLZ', state: 'Canton' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪', phone: '+46', zip: 'Postnummer', state: 'County' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴', phone: '+47', zip: 'Postnummer', state: 'County' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰', phone: '+45', zip: 'Postnummer', state: 'Region' },
  { code: 'FI', name: 'Finland', flag: '🇫🇮', phone: '+358', zip: 'Postinumero', state: 'Region' },
  { code: 'IE', name: 'Ireland', flag: '🇮🇪', phone: '+353', zip: 'Eircode', state: 'County' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴', phone: '+40', zip: 'Cod Poștal', state: 'County' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱', phone: '+48', zip: 'Kod Pocztowy', state: 'Voivodeship' },
  { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', phone: '+420', zip: 'PSČ', state: 'Region' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵', phone: '+81', zip: 'Postal Code', state: 'Prefecture' },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', phone: '+65', zip: 'Postal Code', state: 'District' },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', phone: '+971', zip: 'P.O. Box', state: 'Emirate' },
  { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', phone: '+64', zip: 'Postcode', state: 'Region' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷', phone: '+82', zip: 'Postal Code', state: 'Province' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱', phone: '+972', zip: 'Postal Code', state: 'District' },
  { code: 'IN', name: 'India', flag: '🇮🇳', phone: '+91', zip: 'PIN Code', state: 'State' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷', phone: '+55', zip: 'CEP', state: 'State' },
  { code: 'MX', name: 'Mexico', flag: '🇲🇽', phone: '+52', zip: 'Código Postal', state: 'State' },
  { code: 'ZA', name: 'South Africa', flag: '🇿🇦', phone: '+27', zip: 'Postal Code', state: 'Province' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷', phone: '+90', zip: 'Posta Kodu', state: 'Province' },
];

interface Address {
  _id: string;
  label: string;
  fullName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone?: string;
  isDefault: boolean;
}

const emptyAddress = {
  label: 'Home',
  fullName: '',
  street: '',
  city: '',
  state: '',
  zipCode: '',
  country: '',
  phone: '',
  isDefault: false,
};

export default function SettingsPage() {
  const { user, updateUser } = useAppStore();
  const queryClient = useQueryClient();

  // Address state
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [isAddingAddress, setIsAddingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState(emptyAddress);

  // Profile state
  const [profile, setProfile] = useState({
    phone: user?.profile?.phone || '',
    gender: user?.profile?.gender || '',
    shirtSize: user?.profile?.sizes?.shirtSize || '',
    pantsSize: user?.profile?.sizes?.pantsSize || '',
    shoeSize: user?.profile?.sizes?.shoeSize || '',
    dressSize: user?.profile?.sizes?.dressSize || '',
    notes: user?.profile?.notes || '',
  });

  // Purchase controls state
  const [spendingLimits, setSpendingLimits] = useState({
    daily: user?.preferences?.spendingLimit?.daily || 500,
    monthly: user?.preferences?.spendingLimit?.monthly || 5000,
  });
  const [autoApproveLimit, setAutoApproveLimit] = useState(user?.preferences?.maxAutoApprove || 25);
  const [requireApproval, setRequireApproval] = useState(user?.preferences?.requireApproval ?? true);

  // Wallet state
  const [walletAddress, setWalletAddress] = useState(user?.walletAddress || '');

  // Success messages
  const [successMsg, setSuccessMsg] = useState<Record<string, boolean>>({});
  const showSuccess = (key: string) => {
    setSuccessMsg((s) => ({ ...s, [key]: true }));
    setTimeout(() => setSuccessMsg((s) => ({ ...s, [key]: false })), 3000);
  };

  // Mutations
  const addAddressMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => userApi.addAddress(data),
    onSuccess: (res) => {
      updateUser({ shippingAddresses: res.data.data.addresses } as any);
      setIsAddingAddress(false);
      setAddressForm(emptyAddress);
      showSuccess('address');
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      userApi.updateAddress(id, data),
    onSuccess: (res) => {
      updateUser({ shippingAddresses: res.data.data.addresses } as any);
      setEditingAddress(null);
      showSuccess('address');
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: (id: string) => userApi.deleteAddress(id),
    onSuccess: (res) => {
      updateUser({ shippingAddresses: res.data.data.addresses } as any);
      showSuccess('address');
    },
  });

  const profileMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => userApi.updateProfile(data),
    onSuccess: (res) => {
      updateUser(res.data.data.user);
      showSuccess('profile');
    },
  });

  const settingsMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => userApi.updateSettings(data),
    onSuccess: (res) => {
      updateUser(res.data.data.user);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      showSuccess('settings');
    },
  });

  const walletMutation = useMutation({
    mutationFn: (address: string) => userApi.connectWallet(address),
    onSuccess: () => {
      updateUser({ walletAddress } as any);
      showSuccess('wallet');
    },
  });

  const selectedCountry = COUNTRIES.find((c) => c.code === addressForm.country);
  const addresses = user?.shippingAddresses || [];

  const startEditAddress = (addr: Address) => {
    setEditingAddress(addr);
    setAddressForm({
      label: addr.label,
      fullName: addr.fullName,
      street: addr.street,
      city: addr.city,
      state: addr.state,
      zipCode: addr.zipCode,
      country: addr.country,
      phone: addr.phone || '',
      isDefault: addr.isDefault,
    });
    setIsAddingAddress(false);
  };

  const startAddAddress = () => {
    setEditingAddress(null);
    setAddressForm(emptyAddress);
    setIsAddingAddress(true);
  };

  const cancelAddressEdit = () => {
    setEditingAddress(null);
    setIsAddingAddress(false);
    setAddressForm(emptyAddress);
  };

  const saveAddress = () => {
    if (!addressForm.fullName || !addressForm.street || !addressForm.city || !addressForm.country) return;

    if (editingAddress) {
      updateAddressMutation.mutate({
        id: editingAddress._id,
        data: addressForm,
      });
    } else {
      // If first address, make it default
      const data = { ...addressForm };
      if (addresses.length === 0) data.isDefault = true;
      addAddressMutation.mutate(data);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 outline-none transition-colors';
  const selectClass =
    'w-full px-3.5 py-2.5 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/50 outline-none transition-colors [&>option]:bg-gray-900 [&>option]:text-white';

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your account, addresses, and shopping preferences
        </p>
      </div>

      {/* ─── Shipping Addresses ─────────────────────────────── */}
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <MapPin className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Shipping Addresses</h2>
              <p className="text-xs text-gray-500">
                Your default address determines search localization
              </p>
            </div>
          </div>
          {!isAddingAddress && !editingAddress && (
            <button
              onClick={startAddAddress}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-400 border border-brand-500/20 rounded-lg hover:bg-brand-500/10 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add Address
            </button>
          )}
        </div>

        {successMsg.address && (
          <div className="mb-4 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 flex items-center gap-2">
            <Check className="h-3.5 w-3.5" />
            Address saved successfully
          </div>
        )}

        {/* Existing addresses */}
        {!isAddingAddress && !editingAddress && (
          <div className="space-y-3">
            {addresses.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                <MapPin className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>No addresses yet</p>
                <p className="text-xs mt-1">Add a shipping address to get localized search results</p>
              </div>
            ) : (
              addresses.map((addr) => {
                const country = COUNTRIES.find((c) => c.code === addr.country);
                return (
                  <div
                    key={addr._id}
                    className={`p-4 rounded-lg border transition-colors ${
                      addr.isDefault
                        ? 'border-brand-500/30 bg-brand-500/5'
                        : 'border-white/[0.06] bg-white/[0.01]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-white">{addr.label}</span>
                          {addr.isDefault && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-brand-500/20 text-brand-400 rounded">
                              <Star className="h-2.5 w-2.5" />
                              Default
                            </span>
                          )}
                          {country && (
                            <span className="text-xs text-gray-500">{country.flag}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          {addr.fullName}<br />
                          {addr.street}<br />
                          {addr.city}, {addr.state} {addr.zipCode}<br />
                          {country?.name || addr.country}
                          {addr.phone && ` · ${addr.phone}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 ml-3">
                        {!addr.isDefault && (
                          <button
                            onClick={() => updateAddressMutation.mutate({ id: addr._id, data: { isDefault: true } })}
                            className="p-1.5 text-gray-500 hover:text-brand-400 hover:bg-white/5 rounded transition-colors"
                            title="Set as default"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => startEditAddress(addr)}
                          className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this address?')) deleteAddressMutation.mutate(addr._id);
                          }}
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Add / Edit address form */}
        {(isAddingAddress || editingAddress) && (
          <div className="space-y-4 p-4 rounded-lg border border-white/[0.08] bg-white/[0.01]">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium text-white">
                {editingAddress ? 'Edit Address' : 'New Address'}
              </h3>
              <button onClick={cancelAddressEdit} className="p-1 text-gray-500 hover:text-white rounded transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-400">Label</label>
                <input
                  type="text"
                  value={addressForm.label}
                  onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                  placeholder="Home, Office, etc."
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400">Country *</label>
                <select
                  value={addressForm.country}
                  onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                  className={selectClass}
                >
                  <option value="">Select country</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Full Name *</label>
              <input
                type="text"
                value={addressForm.fullName}
                onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                placeholder="Your full name"
                className={inputClass}
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400">Street Address *</label>
              <input
                type="text"
                value={addressForm.street}
                onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                placeholder="Street name, house number, apartment"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-400">City *</label>
                <input
                  type="text"
                  value={addressForm.city}
                  onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                  placeholder="City"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400">
                  {selectedCountry?.state || 'State / Province'} *
                </label>
                <input
                  type="text"
                  value={addressForm.state}
                  onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                  placeholder="State or province"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-400">
                  {selectedCountry?.zip || 'Postal Code'} *
                </label>
                <input
                  type="text"
                  value={addressForm.zipCode}
                  onChange={(e) => setAddressForm({ ...addressForm, zipCode: e.target.value })}
                  placeholder="Postal code"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-400">Phone</label>
                <input
                  type="tel"
                  value={addressForm.phone}
                  onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                  placeholder={selectedCountry ? `${selectedCountry.phone} ...` : 'Phone number'}
                  className={inputClass}
                />
              </div>
            </div>

            {editingAddress && !editingAddress.isDefault && (
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addressForm.isDefault}
                  onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                  className="rounded border-white/20 bg-white/5 text-brand-600 focus:ring-brand-500"
                />
                Set as default address
              </label>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={saveAddress}
                disabled={addAddressMutation.isPending || updateAddressMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-40"
              >
                <Save className="h-3.5 w-3.5" />
                {addAddressMutation.isPending || updateAddressMutation.isPending ? 'Saving...' : 'Save Address'}
              </button>
              <button
                onClick={cancelAddressEdit}
                className="px-4 py-2 text-gray-400 text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── Profile ────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <User className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Profile</h2>
            <p className="text-xs text-gray-500">
              Sizes and preferences — shared with your AI agents for smarter shopping
            </p>
          </div>
        </div>

        {successMsg.profile && (
          <div className="mb-4 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 flex items-center gap-2">
            <Check className="h-3.5 w-3.5" />
            Profile saved successfully
          </div>
        )}

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-400">Gender</label>
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
            <div>
              <label className="text-xs font-medium text-gray-400">Phone</label>
              <input
                type="tel"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="Phone number"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-400">Shirt / Top Size</label>
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
              <label className="text-xs font-medium text-gray-400">Pants / Bottom Size</label>
              <input
                type="text"
                value={profile.pantsSize}
                onChange={(e) => setProfile({ ...profile, pantsSize: e.target.value })}
                placeholder="e.g., 32x30, M, 10"
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-400">Shoe Size</label>
              <input
                type="text"
                value={profile.shoeSize}
                onChange={(e) => setProfile({ ...profile, shoeSize: e.target.value })}
                placeholder="e.g., 10, 42 EU"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400">Dress Size</label>
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
            <label className="text-xs font-medium text-gray-400">Notes for your AI agent</label>
            <textarea
              value={profile.notes}
              onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
              rows={3}
              maxLength={500}
              placeholder="Allergies, dietary restrictions, style preferences, etc."
              className={`${inputClass} resize-none`}
            />
            <p className="text-[10px] text-gray-600 mt-1">{profile.notes.length}/500</p>
          </div>
        </div>

        <button
          onClick={() => profileMutation.mutate(profile)}
          disabled={profileMutation.isPending}
          className="mt-5 flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          {profileMutation.isPending ? 'Saving...' : 'Save Profile'}
        </button>
      </section>

      {/* ─── Purchase Controls ──────────────────────────────── */}
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Purchase Controls</h2>
            <p className="text-xs text-gray-500">Control how your AI agents make purchases</p>
          </div>
        </div>

        {successMsg.settings && (
          <div className="mb-4 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 flex items-center gap-2">
            <Check className="h-3.5 w-3.5" />
            Settings saved successfully
          </div>
        )}

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Require Approval</p>
              <p className="text-[10px] text-gray-500">AI agents must get your approval before purchasing</p>
            </div>
            <button
              onClick={() => setRequireApproval(!requireApproval)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                requireApproval ? 'bg-brand-600' : 'bg-white/10'
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                  requireApproval ? 'translate-x-[18px]' : 'translate-x-[3px]'
                }`}
              />
            </button>
          </div>

          <div>
            <label className="text-sm text-white">Auto-approve purchases below</label>
            <p className="text-[10px] text-gray-500 mb-2">Orders under this amount skip approval</p>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm">$</span>
              <input
                type="number"
                value={autoApproveLimit}
                onChange={(e) => setAutoApproveLimit(Number(e.target.value))}
                min={0}
                max={1000}
                className={`${inputClass} w-28`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white">Daily Spending Limit</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  value={spendingLimits.daily}
                  onChange={(e) => setSpendingLimits((s) => ({ ...s, daily: Number(e.target.value) }))}
                  min={0}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="text-sm text-white">Monthly Spending Limit</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  value={spendingLimits.monthly}
                  onChange={(e) => setSpendingLimits((s) => ({ ...s, monthly: Number(e.target.value) }))}
                  min={0}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() =>
            settingsMutation.mutate({
              preferences: {
                maxAutoApprove: autoApproveLimit,
                spendingLimit: spendingLimits,
                requireApproval,
              },
            })
          }
          disabled={settingsMutation.isPending}
          className="mt-6 flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" />
          {settingsMutation.isPending ? 'Saving...' : 'Save Settings'}
        </button>
      </section>

      {/* ─── Wallet ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-green-500/10 text-green-400">
            <Wallet className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Wallet</h2>
            <p className="text-xs text-gray-500">Connect your USDC wallet address</p>
          </div>
        </div>

        {successMsg.wallet && (
          <div className="mb-4 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg text-xs text-green-400 flex items-center gap-2">
            <Check className="h-3.5 w-3.5" />
            Wallet connected successfully
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0x... or wallet address"
            className={`${inputClass} flex-1 font-mono text-xs`}
          />
          <button
            onClick={() => walletAddress.trim() && walletMutation.mutate(walletAddress.trim())}
            disabled={walletMutation.isPending}
            className="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors disabled:opacity-40"
          >
            {walletMutation.isPending ? 'Connecting...' : user?.walletAddress ? 'Update' : 'Connect'}
          </button>
        </div>
      </section>
    </div>
  );
}
