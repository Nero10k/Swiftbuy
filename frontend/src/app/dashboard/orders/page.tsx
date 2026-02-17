'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import { formatUSD, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import { Package, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function OrdersPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, statusFilter],
    queryFn: () =>
      userApi
        .getOrders({ page, limit: 20, status: statusFilter || undefined })
        .then((res) => res.data.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Orders</h1>
        <p className="text-sm text-gray-500 mt-1">All purchases made by your AI agents</p>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1.5">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => { setStatusFilter(filter.value); setPage(1); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === filter.value
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mx-auto" />
          </div>
        ) : data?.orders?.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="h-10 w-10 mx-auto text-gray-600 mb-3" />
            <p className="text-sm text-gray-400">No orders found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-left px-6 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Order ID</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Retailer</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {data?.orders?.map((order: any) => (
                <tr key={order._id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      {order.product?.image ? (
                        <img src={order.product.image} alt="" className="h-9 w-9 rounded-lg object-cover bg-white/[0.04]" />
                      ) : (
                        <div className="h-9 w-9 rounded-lg bg-white/[0.04] flex items-center justify-center">
                          <Package className="h-4 w-4 text-gray-600" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <span className="text-sm text-white max-w-[200px] truncate block">{order.product?.title}</span>
                        {order.product?.url && (
                          <a
                            href={order.product.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-brand-400/70 hover:text-brand-400 transition-colors mt-0.5"
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            View on {order.product.retailer || 'retailer'}
                          </a>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-gray-500 font-mono">{order.orderId}</td>
                  <td className="px-6 py-3.5 text-xs text-gray-400 capitalize">{order.product?.retailer}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-white">{formatUSD(order.payment?.amount)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-xs text-gray-500">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {data?.pagination && data.pagination.pages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-white/[0.06]">
            <p className="text-xs text-gray-500">
              Page {data.pagination.page} of {data.pagination.pages} ({data.pagination.total} orders)
            </p>
            <div className="flex gap-1.5">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-white/[0.06] text-gray-400 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.pages}
                className="p-1.5 rounded-lg border border-white/[0.06] text-gray-400 hover:bg-white/[0.04] disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
