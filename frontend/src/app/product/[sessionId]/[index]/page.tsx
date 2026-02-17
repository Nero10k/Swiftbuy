'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { userApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  ExternalLink,
  ShoppingCart,
  Star,
  Shield,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  Check,
  Package,
  Tag,
  Zap,
} from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface Product {
  title: string;
  price: number;
  currency: string;
  currencySymbol: string;
  retailer: string;
  url: string;
  imageUrl?: string;
  image?: string;
  rating?: number;
  reviewCount?: number;
  description?: string;
  brand?: string;
  category?: string;
  source?: string;
  externalId?: string;
  shippingCost?: number;
  features?: string[];
}

interface SearchSessionData {
  sessionId: string;
  query: string;
  products: Product[];
  geo: {
    country: string;
    countryName: string;
    currency: string;
    currencySymbol: string;
  };
  createdAt: string;
  expiresAt: string;
}

export default function ProductViewPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isAuthenticated } = useAppStore();

  const sessionId = params.sessionId as string;
  const index = parseInt(params.index as string, 10);

  const [session, setSession] = useState<SearchSessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseResult, setPurchaseResult] = useState<{
    success: boolean;
    orderId?: string;
    status?: string;
    message?: string;
  } | null>(null);

  const product = session?.products?.[index] || null;
  const totalProducts = session?.products?.length || 0;

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`${API_URL}/products/session/${sessionId}`);
        const data = await res.json();
        if (!data.success) {
          setError(data.error?.message || 'Session not found');
          return;
        }
        setSession(data.data);
      } catch {
        setError('Failed to load product. The link may have expired.');
      } finally {
        setLoading(false);
      }
    };
    fetchSession();
  }, [sessionId]);

  const handleBuy = async () => {
    if (!isAuthenticated || !user || !product) return;
    setPurchasing(true);
    try {
      // Get the first agent to use for the purchase
      const agentsRes = await userApi.getDashboard();
      const agents = agentsRes.data.data.user?.connectedAgents || [];
      const agentId = agents[0]?.agentId || 'dashboard';

      // Use the user API's purchase endpoint or create order directly
      const token = localStorage.getItem('swiftbuy_token');
      const res = await fetch(`${API_URL}/user/orders/quick-buy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          product: {
            title: product.title,
            price: product.price,
            url: product.url,
            retailer: product.retailer,
            image: product.imageUrl || product.image,
            category: product.category,
            brand: product.brand,
            externalId: product.externalId,
            source: product.source,
            shippingCost: product.shippingCost || 0,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setPurchaseResult({
          success: true,
          orderId: data.data.order.orderId,
          status: data.data.order.status,
          message:
            data.data.order.status === 'pending_approval'
              ? 'Order created! Approve it on your dashboard.'
              : 'Order confirmed and processing!',
        });
      } else {
        setPurchaseResult({
          success: false,
          message: data.error?.message || 'Purchase failed',
        });
      }
    } catch (err: any) {
      setPurchaseResult({
        success: false,
        message: err?.response?.data?.error?.message || 'Something went wrong',
      });
    } finally {
      setPurchasing(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#060606] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading product...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !product) {
    return (
      <div className="min-h-screen bg-[#060606] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="p-4 rounded-2xl bg-red-500/10 inline-block mb-4">
            <Clock className="h-8 w-8 text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">
            {error || 'Product not found'}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            This product link may have expired. Search results are available for 1 hour after searching.
          </p>
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-500 transition-colors"
          >
            Go to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const imgSrc = product.imageUrl || product.image;
  const currSymbol = product.currencySymbol || session?.geo?.currencySymbol || '$';
  const currency = product.currency || session?.geo?.currency || 'USD';

  return (
    <div className="min-h-screen bg-[#060606]">
      {/* Top bar */}
      <div className="sticky top-0 z-50 bg-[#060606]/90 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600/20">
              <Zap className="h-3.5 w-3.5 text-brand-400" />
            </div>
            <span className="text-sm font-semibold text-white">Swiftbuy</span>
          </div>
          {isAuthenticated ? (
            <a
              href="/dashboard"
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              Dashboard
            </a>
          ) : (
            <a
              href="/login"
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Sign in
            </a>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Back to results + navigation */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {totalProducts > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">
                {index + 1} of {totalProducts} results
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => router.replace(`/product/${sessionId}/${index - 1}`)}
                  disabled={index <= 0}
                  className="p-1.5 rounded-lg border border-white/[0.08] text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => router.replace(`/product/${sessionId}/${index + 1}`)}
                  disabled={index >= totalProducts - 1}
                  className="p-1.5 rounded-lg border border-white/[0.08] text-gray-500 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Search query context */}
        <div className="mb-6 flex items-center gap-2 text-xs text-gray-600">
          <Tag className="h-3 w-3" />
          <span>
            Search: &quot;{session?.query}&quot;
          </span>
          {session?.geo?.countryName && (
            <>
              <span>·</span>
              <MapPin className="h-3 w-3" />
              <span>{session.geo.countryName}</span>
            </>
          )}
        </div>

        {/* Product card */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
          <div className="md:flex">
            {/* Image */}
            <div className="md:w-2/5 bg-white/[0.02] flex items-center justify-center p-8 min-h-[280px]">
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={product.title}
                  className="max-h-72 max-w-full object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex flex-col items-center text-gray-600">
                  <Package className="h-16 w-16 mb-2 opacity-20" />
                  <span className="text-xs">No image available</span>
                </div>
              )}
            </div>

            {/* Details */}
            <div className="md:w-3/5 p-6 md:p-8 flex flex-col">
              {/* Brand / Category */}
              <div className="flex items-center gap-2 mb-2">
                {product.brand && (
                  <span className="text-xs font-medium text-brand-400 uppercase tracking-wide">
                    {product.brand}
                  </span>
                )}
                {product.category && (
                  <span className="text-xs text-gray-600">· {product.category}</span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-xl font-semibold text-white leading-snug mb-3">
                {product.title}
              </h1>

              {/* Rating */}
              {product.rating && (
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                    <span className="text-sm font-medium text-white">{product.rating}</span>
                  </div>
                  {product.reviewCount && (
                    <span className="text-xs text-gray-500">
                      ({product.reviewCount.toLocaleString()} reviews)
                    </span>
                  )}
                </div>
              )}

              {/* Price */}
              <div className="mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-white">
                    {currSymbol}
                    {product.price?.toFixed(2)}
                  </span>
                  <span className="text-sm text-gray-500">{currency}</span>
                </div>
                {product.shippingCost ? (
                  <p className="text-xs text-gray-500 mt-1">
                    + {currSymbol}{product.shippingCost.toFixed(2)} shipping
                  </p>
                ) : (
                  <p className="text-xs text-green-500 mt-1">Free shipping</p>
                )}
              </div>

              {/* Retailer + direct link */}
              <div className="mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>
                    Sold by <span className="text-white font-medium">{product.retailer}</span>
                  </span>
                </div>
                {product.url && !product.url.includes('google.com') && (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1.5 text-xs text-brand-400/70 hover:text-brand-400 transition-colors truncate max-w-full"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{new URL(product.url).hostname.replace('www.', '')}{new URL(product.url).pathname.substring(0, 50)}{new URL(product.url).pathname.length > 50 ? '…' : ''}</span>
                  </a>
                )}
              </div>

              {/* Description */}
              {product.description && (
                <p className="text-sm text-gray-400 leading-relaxed mb-6 line-clamp-4">
                  {product.description}
                </p>
              )}

              {/* Features */}
              {product.features && product.features.length > 0 && (
                <ul className="space-y-1.5 mb-6">
                  {product.features.slice(0, 5).map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                      <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Spacer to push buttons to bottom */}
              <div className="flex-1" />

              {/* Action buttons */}
              <div className="space-y-3 mt-4">
                {purchaseResult ? (
                  <div
                    className={cn(
                      'p-4 rounded-xl border text-sm',
                      purchaseResult.success
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-red-500/10 border-red-500/20 text-red-400'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {purchaseResult.success ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Shield className="h-4 w-4" />
                      )}
                      <span className="font-medium">
                        {purchaseResult.success ? 'Order Created' : 'Purchase Failed'}
                      </span>
                    </div>
                    <p className="text-xs opacity-80">{purchaseResult.message}</p>
                    {purchaseResult.orderId && (
                      <div className="mt-3 flex gap-2">
                        <a
                          href="/dashboard/orders"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-lg text-xs font-medium text-white hover:bg-white/20 transition-colors"
                        >
                          View Orders
                        </a>
                        {purchaseResult.status === 'pending_approval' && (
                          <a
                            href="/dashboard/approvals"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 rounded-lg text-xs font-medium text-white hover:bg-brand-500 transition-colors"
                          >
                            Approve Now
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {isAuthenticated ? (
                      <button
                        onClick={handleBuy}
                        disabled={purchasing}
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-500 transition-colors disabled:opacity-50"
                      >
                        {purchasing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="h-4 w-4" />
                            Buy with Swiftbuy — {currSymbol}
                            {((product.price || 0) + (product.shippingCost || 0)).toFixed(2)}
                          </>
                        )}
                      </button>
                    ) : (
                      <a
                        href="/login"
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-brand-600 text-white font-medium rounded-xl hover:bg-brand-500 transition-colors"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Sign in to Buy — {currSymbol}
                        {((product.price || 0) + (product.shippingCost || 0)).toFixed(2)}
                      </a>
                    )}

                    {product.url && (
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 px-6 py-3 border border-white/[0.08] text-gray-300 font-medium rounded-xl hover:bg-white/[0.04] hover:text-white transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View on {product.retailer}
                      </a>
                    )}
                  </>
                )}

                {/* Trust signals */}
                <div className="flex items-center justify-center gap-4 pt-2 text-[10px] text-gray-600">
                  <div className="flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    <span>Paid with USDC</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    <span>Spending limits enforced</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Other results */}
        {totalProducts > 1 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold text-white mb-4">
              Other results for &quot;{session?.query}&quot;
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {session?.products
                .map((p, i) => ({ ...p, originalIndex: i }))
                .filter((_, i) => i !== index)
                .slice(0, 6)
                .map((p) => {
                  const pImg = p.imageUrl || p.image;
                  return (
                    <a
                      key={p.originalIndex}
                      href={`/product/${sessionId}/${p.originalIndex}`}
                      className={cn(
                        'group p-3 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:border-brand-500/20 hover:bg-white/[0.03] transition-all'
                      )}
                    >
                      <div className="flex gap-3">
                        <div className="w-16 h-16 bg-white/[0.02] rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
                          {pImg ? (
                            <img
                              src={pImg}
                              alt={p.title}
                              className="max-h-14 max-w-14 object-contain"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Package className="h-6 w-6 text-gray-700" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-300 line-clamp-2 group-hover:text-white transition-colors">
                            {p.title}
                          </p>
                          <p className="text-sm font-bold text-white mt-1">
                            {currSymbol}{p.price?.toFixed(2)}
                          </p>
                          <p className="text-[10px] text-gray-600">{p.retailer}</p>
                        </div>
                      </div>
                    </a>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


