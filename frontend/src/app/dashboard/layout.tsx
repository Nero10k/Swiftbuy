'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { useAppStore } from '@/lib/store';
import { authApi } from '@/lib/api';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, setAuth, logout } = useAppStore();

  useEffect(() => {
    const token = localStorage.getItem('swiftbuy_token');
    if (!token) {
      router.push('/login');
      return;
    }

    authApi
      .getProfile()
      .then((res) => {
        const user = res.data.data.user;
        setAuth(user, token);
        if (!user.onboardingComplete) {
          router.push('/onboarding');
        }
      })
      .catch(() => {
        logout();
        router.push('/login');
      });
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#060606]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#060606]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
