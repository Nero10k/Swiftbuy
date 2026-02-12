'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import { formatUSD, formatDate } from '@/lib/utils';
import { Check, X, Package, Clock, ExternalLink } from 'lucide-react';
import { useState } from 'react';

export default function ApprovalsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['orders', 1, 'pending_approval'],
    queryFn: () =>
      userApi.getOrders({ page: 1, limit: 50, status: 'pending_approval' }).then((res) => res.data.data),
  });

  const approveMutation = useMutation({
    mutationFn: (orderId: string) => userApi.approveOrder(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      userApi.rejectOrder(orderId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Pending Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review and approve purchases requested by your AI agents
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent mx-auto" />
        </div>
      ) : data?.orders?.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
          <Clock className="h-10 w-10 mx-auto mb-3 text-gray-600" />
          <p className="text-sm font-medium text-white">All caught up!</p>
          <p className="text-xs text-gray-500 mt-1">No pending approvals right now</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.orders?.map((order: any) => (
            <div key={order._id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  {order.product?.image ? (
                    <img src={order.product.image} alt="" className="h-16 w-16 rounded-xl object-cover bg-white/[0.04]" />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-white/[0.04] flex items-center justify-center">
                      <Package className="h-6 w-6 text-gray-600" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-medium text-white">{order.product?.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {order.product?.retailer} · Order {order.orderId}
                    </p>
                    <p className="text-xs text-gray-500">Requested {formatDate(order.createdAt)}</p>
                    {order.product?.url && (
                      <a href={order.product.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-1">
                        View product <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-white">{formatUSD(order.payment?.amount)}</p>
                  <p className="text-[10px] text-gray-500">≈ {order.payment?.amount?.toFixed(2)} USDC</p>
                </div>
              </div>

              {order.shippingAddress && (
                <div className="mt-4 p-3 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                  <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Ship to</p>
                  <p className="text-xs text-gray-300">
                    {order.shippingAddress.fullName}, {order.shippingAddress.street}, {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zipCode}
                  </p>
                </div>
              )}

              {rejectingId === order._id && (
                <div className="mt-4 p-4 bg-red-500/[0.03] rounded-lg border border-red-500/10">
                  <label className="text-xs font-medium text-red-400">Reason for rejection (optional)</label>
                  <input type="text" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., too expensive, wrong item..."
                    className="mt-2 w-full px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500/30 outline-none" />
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => { rejectMutation.mutate({ orderId: order._id, reason: rejectReason }); setRejectingId(null); setRejectReason(''); }}
                      className="px-4 py-2 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-500 transition-colors">
                      Confirm Rejection
                    </button>
                    <button onClick={() => { setRejectingId(null); setRejectReason(''); }}
                      className="px-4 py-2 text-gray-400 text-xs rounded-lg hover:bg-white/[0.04] transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {rejectingId !== order._id && (
                <div className="flex gap-2.5 mt-4 pt-4 border-t border-white/[0.06]">
                  <button onClick={() => approveMutation.mutate(order._id)} disabled={approveMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-500 transition-colors disabled:opacity-40">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button onClick={() => setRejectingId(order._id)} disabled={rejectMutation.isPending}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white/[0.03] text-red-400 text-xs font-medium rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
