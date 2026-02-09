'use client';

import { useQuery } from '@tanstack/react-query';
import { userApi } from '@/lib/api';
import { formatUSD, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils';
import {
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
  Package,
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => userApi.getDashboard().then((res) => res.data.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded" />
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-white/5 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.user?.stats;
  const pendingCount = data?.pendingApprovals?.length || 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">
          Overview of your AI shopping activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Orders"
          value={stats?.totalOrders || 0}
          icon={ShoppingCart}
          color="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          title="Total Spent"
          value={formatUSD(stats?.totalSpent || 0)}
          icon={DollarSign}
          color="bg-green-500/10 text-green-400"
        />
        <StatCard
          title="Avg. Order Value"
          value={formatUSD(stats?.averageOrderValue || 0)}
          icon={TrendingUp}
          color="bg-purple-500/10 text-purple-400"
        />
        <StatCard
          title="Pending Approvals"
          value={pendingCount}
          icon={Clock}
          color={pendingCount > 0 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-gray-500/10 text-gray-400'}
          alert={pendingCount > 0}
        />
      </div>

      {/* Pending Approvals */}
      {pendingCount > 0 && (
        <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-yellow-400">
              Pending Approvals ({pendingCount})
            </h2>
            <Link
              href="/dashboard/approvals"
              className="text-sm text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
            >
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-3">
            {data?.pendingApprovals?.slice(0, 3).map((order: any) => (
              <div
                key={order._id}
                className="flex items-center justify-between bg-white/[0.03] rounded-lg p-4 border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-yellow-400" />
                  <div>
                    <p className="font-medium text-white text-sm">
                      {order.product?.title?.substring(0, 60)}...
                    </p>
                    <p className="text-xs text-gray-500">
                      {order.product?.retailer} • {formatDate(order.createdAt)}
                    </p>
                  </div>
                </div>
                <p className="font-semibold text-white">
                  {formatUSD(order.payment?.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="bg-white/[0.03] rounded-xl border border-white/5">
        <div className="flex items-center justify-between p-6 border-b border-white/5">
          <h2 className="text-lg font-semibold text-white">Recent Orders</h2>
          <Link
            href="/dashboard/orders"
            className="text-sm text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            View all <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="divide-y divide-white/5">
          {data?.recentOrders?.length === 0 && (
            <div className="p-12 text-center text-gray-500">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No orders yet. Your AI agent will shop for you!</p>
            </div>
          )}
          {data?.recentOrders?.map((order: any) => (
            <div key={order._id} className="flex items-center justify-between p-4 px-6">
              <div className="flex items-center gap-4">
                {order.product?.image ? (
                  <img
                    src={order.product.image}
                    alt=""
                    className="h-12 w-12 rounded-lg object-cover bg-white/5"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-white/5 flex items-center justify-center">
                    <Package className="h-6 w-6 text-gray-500" />
                  </div>
                )}
                <div>
                  <p className="font-medium text-white text-sm">
                    {order.product?.title?.substring(0, 50)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {order.orderId} • {formatDate(order.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(
                    order.status
                  )}`}
                >
                  {getStatusLabel(order.status)}
                </span>
                <p className="font-semibold text-white text-sm w-20 text-right">
                  {formatUSD(order.payment?.amount)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      {data?.insights && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white/[0.03] rounded-xl border border-white/5 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Top Categories</h3>
            <div className="space-y-3">
              {data.insights.topCategories?.map((cat: any) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 capitalize">{cat.name}</span>
                  <span className="text-sm font-medium text-white">{cat.count} orders</span>
                </div>
              ))}
              {data.insights.topCategories?.length === 0 && (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
            </div>
          </div>
          <div className="bg-white/[0.03] rounded-xl border border-white/5 p-6">
            <h3 className="text-sm font-semibold text-white mb-4">Favorite Brands</h3>
            <div className="space-y-3">
              {data.insights.topBrands?.map((brand: any) => (
                <div key={brand.name} className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">{brand.name}</span>
                  <span className="text-sm font-medium text-white">{brand.count} orders</span>
                </div>
              ))}
              {data.insights.topBrands?.length === 0 && (
                <p className="text-sm text-gray-500">No data yet</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  alert,
}: {
  title: string;
  value: string | number;
  icon: any;
  color: string;
  alert?: boolean;
}) {
  return (
    <div className={`bg-white/[0.03] rounded-xl border p-6 ${alert ? 'border-yellow-500/20' : 'border-white/5'}`}>
      <div className="flex items-center justify-between">
        <div className={`p-2 rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        {alert && (
          <span className="flex h-3 w-3">
            <span className="animate-ping absolute h-3 w-3 rounded-full bg-yellow-400 opacity-75" />
            <span className="relative rounded-full h-3 w-3 bg-yellow-500" />
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-gray-400">{title}</p>
    </div>
  );
}
