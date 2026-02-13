'use client';

import { Zap, User, Bot, Wallet, ShoppingBag, Plane, Hotel, ShoppingCart, RotateCcw } from 'lucide-react';

/* ─── Animated Architecture Diagram ─── */

export default function ArchitectureDiagram() {
  return (
    <div className="bg-white/[0.03] rounded-3xl p-8 md:p-12 border border-white/5 overflow-hidden">
      <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-10 text-center">
        Architecture
      </p>

      {/* Desktop layout */}
      <div className="hidden md:block">
        {/* ─── Top Row: User → Agent → Swiftbuy → Providers ─── */}
        <div className="flex items-center justify-center gap-0">
          <ArchNode icon={User} label="User" sublabel="Natural language" variant="default" delay={0} />
          <AnimatedArrow label="talks to agent" delay={100} />
          <ArchNode icon={Bot} label="AI Agent" sublabel="OpenClaw / GPT / Claude" variant="default" delay={200} />
          <AnimatedArrow label="API call" delay={300} />

          {/* Swiftbuy API — center star */}
          <div className="relative animate-fade-in" style={{ animationDelay: '400ms' }}>
            <div className="absolute -inset-2 bg-brand-500/20 rounded-3xl blur-xl animate-glow" />
            <div className="relative bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-2xl p-6 text-center shadow-xl shadow-brand-500/25 min-w-[170px] z-10">
              <Zap className="h-7 w-7 mx-auto mb-2" />
              <p className="font-bold text-base">Swiftbuy API</p>
              <p className="text-brand-200 text-xs mt-1">Search · Purchase · Track</p>
            </div>
          </div>

          <AnimatedArrow label="searches" delay={500} />

          {/* Providers stack */}
          <div className="flex flex-col gap-2.5 animate-fade-in" style={{ animationDelay: '600ms' }}>
            <MiniNode icon={ShoppingBag} label="Retailers" />
            <MiniNode icon={Plane} label="Airlines" />
            <MiniNode icon={Hotel} label="Hotels" />
          </div>
        </div>

        {/* ─── Vertical flow: Swiftbuy → Karma → Retailer ─── */}
        <div className="flex flex-col items-center mt-0">
          <VerticalArrow label="USDC payment" color="brand" delay={700} />
          <div className="animate-fade-in" style={{ animationDelay: '800ms' }}>
            <ArchNode icon={Wallet} label="Karma Wallet" sublabel="USDC → Fiat off-ramp" variant="karma" delay={0} />
          </div>
          <VerticalArrow label="fiat checkout" color="emerald" delay={900} />
          <div className="animate-fade-in" style={{ animationDelay: '1000ms' }}>
            <ArchNode icon={ShoppingCart} label="Retailer" sublabel="Order placed" variant="default" delay={0} />
          </div>
        </div>

        {/* ─── Loop back indicator ─── */}
        <div className="mt-8 animate-fade-in" style={{ animationDelay: '1100ms' }}>
          <div className="max-w-lg mx-auto">
            <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-brand-500/10 bg-brand-500/[0.04]">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-500/15">
                <RotateCcw className="h-4 w-4 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-gray-400">Retailer</span>
                  <span className="text-brand-500/40">→</span>
                  <span className="text-brand-300 font-medium">Swiftbuy</span>
                  <span className="text-brand-500/40">→</span>
                  <span className="text-gray-400">You</span>
                </div>
                <p className="text-[11px] text-gray-600 mt-0.5">
                  Order updates, tracking & delivery status loop back to you in real-time
                </p>
              </div>
              <div className="shrink-0">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-soft" />
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-pulse-soft" style={{ animationDelay: '0.5s' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-400/30 animate-pulse-soft" style={{ animationDelay: '1s' }} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile layout — simplified vertical */}
      <div className="md:hidden space-y-3">
        <ArchNode icon={User} label="User" sublabel="Natural language" variant="default" delay={0} />
        <MobileArrow label="talks to agent" />
        <ArchNode icon={Bot} label="AI Agent" sublabel="OpenClaw / GPT / Claude" variant="default" delay={0} />
        <MobileArrow label="API call" />
        <div className="relative">
          <div className="absolute -inset-2 bg-brand-500/20 rounded-3xl blur-xl animate-glow" />
          <div className="relative bg-gradient-to-br from-brand-500 to-brand-700 text-white rounded-2xl p-5 text-center shadow-xl shadow-brand-500/25 z-10">
            <Zap className="h-6 w-6 mx-auto mb-2" />
            <p className="font-bold">Swiftbuy API</p>
            <p className="text-brand-200 text-xs mt-1">Search · Purchase · Track</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <MobileArrow label="searches" />
            <div className="space-y-2 mt-3">
              <MiniNode icon={ShoppingBag} label="Retailers" />
              <MiniNode icon={Plane} label="Airlines" />
              <MiniNode icon={Hotel} label="Hotels" />
            </div>
          </div>
          <div>
            <MobileArrow label="payment" />
            <div className="space-y-2 mt-3">
              <ArchNode icon={Wallet} label="Karma Wallet" sublabel="USDC → Fiat" variant="karma" delay={0} />
              <MobileArrow label="checkout" />
              <ArchNode icon={ShoppingCart} label="Retailer" sublabel="Order placed" variant="default" delay={0} />
            </div>
          </div>
        </div>
        {/* Mobile loop indicator */}
        <div className="flex items-center gap-2.5 px-4 py-3 mt-4 rounded-xl border border-brand-500/10 bg-brand-500/[0.04]">
          <RotateCcw className="h-4 w-4 text-brand-400 shrink-0" />
          <p className="text-xs text-gray-500">
            Order updates & tracking loop back to you in real-time
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function ArchNode({
  icon: Icon,
  label,
  sublabel,
  variant,
  delay,
}: {
  icon: any;
  label: string;
  sublabel: string;
  variant: 'default' | 'karma';
  delay: number;
}) {
  const baseStyles =
    variant === 'karma'
      ? 'bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40'
      : 'bg-white/[0.04] border-white/[0.08] hover:border-white/20';

  const iconColor = variant === 'karma' ? 'text-emerald-400' : 'text-gray-400';

  return (
    <div
      className={`${baseStyles} rounded-2xl border p-4 text-center min-w-[140px] transition-all duration-300 hover:scale-105 animate-fade-in`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <Icon className={`h-5 w-5 mx-auto ${iconColor} mb-1.5`} />
      <p className="font-semibold text-white text-sm">{label}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">{sublabel}</p>
    </div>
  );
}

function MiniNode({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3.5 py-2.5 hover:border-white/20 transition-all duration-300 hover:scale-105">
      <Icon className="h-4 w-4 text-gray-500 shrink-0" />
      <span className="text-xs font-medium text-gray-300 whitespace-nowrap">{label}</span>
    </div>
  );
}

function AnimatedArrow({ label, delay }: { label: string; delay: number }) {
  return (
    <div
      className="flex flex-col items-center mx-3 animate-fade-in"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-[10px] text-gray-600 mb-1.5 whitespace-nowrap">{label}</p>
      <div className="relative w-16 h-px">
        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-white/10" />
        <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand-400 animate-flow-right" />
        <div className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-brand-400/60 animate-flow-right-delayed" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-[5px] border-l-white/20 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent" />
      </div>
    </div>
  );
}

function VerticalArrow({ label, color, delay }: { label: string; color: 'brand' | 'emerald'; delay: number }) {
  const dotColor = color === 'brand' ? 'bg-brand-400' : 'bg-emerald-400';
  const lineColor = color === 'brand' ? 'from-brand-500/40' : 'from-emerald-500/40';

  return (
    <div className="relative h-14 w-px animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className={`absolute inset-0 bg-gradient-to-b ${lineColor} to-transparent`} />
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dotColor} animate-flow-down`} />
      <p className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] text-gray-600 whitespace-nowrap">
        {label}
      </p>
    </div>
  );
}

function MobileArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1">
      <div className="w-px h-6 bg-white/10 relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-400 animate-flow-down" />
      </div>
      <span className="text-[10px] text-gray-600">{label}</span>
    </div>
  );
}
