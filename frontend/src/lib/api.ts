import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('swiftbuy_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('swiftbuy_token');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/register', data),
  getProfile: () => api.get('/auth/me'),
};

// User
export const userApi = {
  getDashboard: () => api.get('/user/dashboard'),
  getOrders: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/user/orders', { params }),
  approveOrder: (orderId: string) =>
    api.post(`/user/orders/${orderId}/approve`),
  rejectOrder: (orderId: string, reason?: string) =>
    api.post(`/user/orders/${orderId}/reject`, { reason }),
  getTransactions: (params?: { page?: number; limit?: number }) =>
    api.get('/user/transactions', { params }),
  updateSettings: (data: Record<string, unknown>) =>
    api.patch('/user/settings', data),
  addAddress: (data: Record<string, unknown>) =>
    api.post('/user/addresses', data),
  updateAddress: (addressId: string, data: Record<string, unknown>) =>
    api.patch(`/user/addresses/${addressId}`, data),
  deleteAddress: (addressId: string) =>
    api.delete(`/user/addresses/${addressId}`),
  updateProfile: (data: Record<string, unknown>) =>
    api.patch('/user/profile', data),
  connectWallet: (walletAddress: string) =>
    api.post('/user/wallet/connect', { walletAddress }),
  completeOnboarding: (data: Record<string, unknown>) =>
    api.post('/user/onboarding', data),
};

// Agents
export const agentApi = {
  getAgents: () => api.get('/user/agents'),
  registerAgent: (data: { agentName: string; permissions?: string[] }) =>
    api.post('/user/agents', data),
  deleteAgent: (agentId: string) =>
    api.delete(`/user/agents/${agentId}`),
};

// Wallet (Karma)
export const walletApi = {
  setup: () => api.post('/wallet/setup'),
  getKycStatus: () => api.get('/wallet/kyc-status'),
  getStatus: () => api.get('/wallet/status'),
  getBalance: () => api.get('/wallet/balance'),
  getTransactions: (params?: { limit?: number }) =>
    api.get('/wallet/transactions', { params }),
  freezeCard: () => api.post('/wallet/freeze'),
  unfreezeCard: () => api.post('/wallet/unfreeze'),
  updateLimits: (data: { perTxnLimit?: number; dailyLimit?: number; monthlyLimit?: number }) =>
    api.patch('/wallet/limits', data),
};

// Chat
export const chatApi = {
  getWelcome: () => api.get('/chat/welcome'),
  sendMessage: (data: { message: string; conversationId?: string }) =>
    api.post('/chat/message', data),
  getConversations: () => api.get('/chat/conversations'),
  getConversation: (conversationId: string) =>
    api.get(`/chat/conversations/${conversationId}`),
};

export default api;
