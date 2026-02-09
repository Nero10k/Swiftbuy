import { create } from 'zustand';

interface User {
  _id: string;
  email: string;
  name: string;
  walletAddress?: string;
  onboardingComplete?: boolean;
  profile?: {
    phone?: string;
    sizes?: {
      shirtSize?: string;
      pantsSize?: string;
      shoeSize?: string;
      dressSize?: string;
    };
    gender?: string;
    notes?: string;
  };
  preferences: {
    maxAutoApprove: number;
    spendingLimit: { daily: number; monthly: number };
    requireApproval: boolean;
  };
  shippingAddresses?: Array<{
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
  }>;
  connectedAgents?: Array<{
    agentId: string;
    agentName: string;
    permissions: string[];
    connectedAt: string;
  }>;
  stats: {
    totalOrders: number;
    totalSpent: number;
    averageOrderValue: number;
  };
}

interface AppState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('swiftbuy_token') : null,
  isAuthenticated: typeof window !== 'undefined' ? !!localStorage.getItem('swiftbuy_token') : false,

  setAuth: (user, token) => {
    localStorage.setItem('swiftbuy_token', token);
    set({ user, token, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('swiftbuy_token');
    set({ user: null, token: null, isAuthenticated: false });
  },

  updateUser: (updates) => {
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    }));
  },
}));
