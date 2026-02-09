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
      userApi
        .getOrders({ page: 1, limit: 50, status: 'pending_approval' })
        .then((res) => res.data.data),
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

  const handleApprove = (orderId: string) => {
    approveMutation.mutate(orderId);
  };

  const handleReject = (orderId: string) => {
    rejectMutation.mutate({ orderId, reason: rejectReason });
    setRejectingId(null);
    setRejectReason('');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Pending Approvals</h1>
        <p className="text-gray-400 mt-1">
          Review and approve purchases requested by your AI agents
        </p>
      </div>

      {isLoading ? (
        <div className="p-12 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent mx-auto" />
        </div>
      ) : data?.orders?.length === 0 ? (
        <div className="bg-white/[0.03] rounded-xl border border-white/5 p-12 text-center">
          <Clock className="h-12 w-12 mx-auto mb-3 text-gray-600" />
          <h3 className="text-lg font-medium text-white">All caught up!</h3>
          <p className="text-gray-400 mt-1">No pending approvals right now</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data?.orders?.map((order: any) => (
            <div
              key={order._id}
              className="bg-white/[0.03] rounded-xl border border-white/5 p-6"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  {order.product?.image ? (
                    <img
                      src={order.product.image}
                      alt=""
                      className="h-20 w-20 rounded-xl object-cover bg-white/5"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-xl bg-white/5 flex items-center justify-center">
                      <Package className="h-8 w-8 text-gray-500" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-white">
                      {order.product?.title}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {order.product?.retailer} • Order {order.orderId}
                    </p>
                    <p className="text-sm text-gray-500">
                      Requested {formatDate(order.createdAt)}
                    </p>
                    {order.product?.url && (
                      <a
                        href={order.product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1 mt-1"
                      >
                        View product <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-white">
                    {formatUSD(order.payment?.amount)}
                  </p>
                  <p className="text-xs text-gray-500">
                    ≈ {order.payment?.amount?.toFixed(2)} USDC
                  </p>
                </div>
              </div>

              {/* Shipping address */}
              {order.shippingAddress && (
                <div className="mt-4 p-3 bg-white/[0.02] rounded-lg border border-white/5">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Ship to</p>
                  <p className="text-sm text-gray-300">
                    {order.shippingAddress.fullName}, {order.shippingAddress.street},{' '}
                    {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                    {order.shippingAddress.zipCode}
                  </p>
                </div>
              )}

              {/* Reject reason input */}
              {rejectingId === order._id && (
                <div className="mt-4 p-4 bg-red-500/5 rounded-lg border border-red-500/10">
                  <label className="text-sm font-medium text-red-400">
                    Reason for rejection (optional)
                  </label>
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="e.g., too expensive, wrong item..."
                    className="mt-2 w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleReject(order._id)}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-500 transition-colors"
                    >
                      Confirm Rejection
                    </button>
                    <button
                      onClick={() => {
                        setRejectingId(null);
                        setRejectReason('');
                      }}
                      className="px-4 py-2 text-gray-400 text-sm font-medium rounded-lg hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {rejectingId !== order._id && (
                <div className="flex gap-3 mt-4 pt-4 border-t border-white/5">
                  <button
                    onClick={() => handleApprove(order._id)}
                    disabled={approveMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                    Approve Purchase
                  </button>
                  <button
                    onClick={() => setRejectingId(order._id)}
                    disabled={rejectMutation.isPending}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/5 text-red-400 text-sm font-medium rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                    Reject
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
