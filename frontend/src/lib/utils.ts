import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending_approval: 'bg-yellow-500/10 text-yellow-400',
    approved: 'bg-blue-500/10 text-blue-400',
    processing: 'bg-blue-500/10 text-blue-400',
    purchasing: 'bg-indigo-500/10 text-indigo-400',
    confirmed: 'bg-green-500/10 text-green-400',
    shipped: 'bg-purple-500/10 text-purple-400',
    delivered: 'bg-green-500/10 text-green-400',
    cancelled: 'bg-gray-500/10 text-gray-400',
    failed: 'bg-red-500/10 text-red-400',
    refunded: 'bg-orange-500/10 text-orange-400',
  };
  return colors[status] || 'bg-gray-500/10 text-gray-400';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending_approval: 'Pending Approval',
    approved: 'Approved',
    processing: 'Processing',
    purchasing: 'Purchasing',
    confirmed: 'Confirmed',
    shipped: 'Shipped',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    failed: 'Failed',
    refunded: 'Refunded',
  };
  return labels[status] || status;
}
