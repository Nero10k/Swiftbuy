'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  ShoppingCart,
  Clock,
  Wallet,
  Settings,
  LogOut,
  Zap,
  Bot,
  MessageCircle,
  BookOpen,
  ExternalLink,
  Key,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

const navSections = [
  {
    items: [
      { name: 'Home', href: '/dashboard', icon: Home },
    ],
  },
  {
    label: 'PLATFORM',
    items: [
      { name: 'Chat', href: '/dashboard/chat', icon: MessageCircle },
      { name: 'Agents', href: '/dashboard/agents', icon: Bot },
    ],
  },
  {
    label: 'SHOPPING',
    items: [
      { name: 'Orders', href: '/dashboard/orders', icon: ShoppingCart },
      { name: 'Approvals', href: '/dashboard/approvals', icon: Clock },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { name: 'Wallet', href: '/dashboard/wallet', icon: Wallet },
      { name: 'API Keys', href: '/dashboard/agents', icon: Key },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAppStore();

  return (
    <div className="flex h-screen w-60 flex-col bg-[#0a0a0a] border-r border-white/[0.06]">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-[15px] font-semibold text-white tracking-tight">Swiftbuy</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-1 pb-4 space-y-5 overflow-y-auto">
        {navSections.map((section, si) => (
          <div key={si}>
            {section.label && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name + item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors',
                      isActive
                        ? 'bg-brand-600 text-white'
                        : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Support section */}
        <div>
          <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-[0.08em] text-gray-500 uppercase">
            Support
          </p>
          <div className="space-y-0.5">
            <a
              href="https://github.com/Nero10k/Swiftbuy"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-gray-400 hover:bg-white/[0.04] hover:text-gray-200 transition-colors"
            >
              <BookOpen className="h-[18px] w-[18px]" />
              Documentation
              <ExternalLink className="h-3 w-3 ml-auto text-gray-600" />
            </a>
          </div>
        </div>
      </nav>

      {/* User info */}
      <div className="border-t border-white/[0.06] px-3 py-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-gray-300 font-semibold text-xs">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-gray-200 truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-[11px] text-gray-500 truncate">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={logout}
            className="p-1.5 rounded-lg text-gray-600 hover:text-gray-400 hover:bg-white/[0.04] transition-colors"
            title="Logout"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
