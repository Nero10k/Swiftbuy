'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useEffect, useRef, useState, useCallback } from 'react';

/* ─── Particle canvas (subtle floating dots) ─── */
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const particles: { x: number; y: number; vx: number; vy: number; size: number; opacity: number }[] = [];
    const count = 60;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.05,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
        ctx.fill();
      }

      // Draw connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${0.03 * (1 - dist / 120)})`;
            ctx.stroke();
          }
        }
      }

      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-0" />;
}

/* ─── Animated counter ─── */
function AnimatedNumber({ target, suffix = '' }: { target: string; suffix?: string }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
      <span className="text-4xl md:text-5xl font-bold text-white">{target}</span>
      {suffix && <span className="text-4xl md:text-5xl font-bold text-gray-600">{suffix}</span>}
    </div>
  );
}

/* ─── Scroll-triggered fade in ─── */
function FadeIn({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export default function LandingV2() {
  return (
    <div className="min-h-screen bg-[#060606] text-white font-mono relative overflow-hidden">
      {/* Particle field */}
      <ParticleField />

      {/* Grid background */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.04] z-[1]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial glow behind hero */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-white/[0.02] rounded-full blur-[120px] pointer-events-none z-[1]" />

      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 w-full z-50 bg-[#060606]/60 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-white flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#060606" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight">ClawCart</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-[13px] text-gray-500">
            <a href="#how" className="hover:text-white transition-colors">How it works</a>
            <a href="#architecture" className="hover:text-white transition-colors">Architecture</a>
            <a href="#developers" className="hover:text-white transition-colors">Developers</a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-[13px] text-gray-500 hover:text-white transition-colors">
              Sign in
            </Link>
            <Link
              href="/dashboard"
              className="text-[13px] font-medium text-black bg-white hover:bg-gray-200 rounded-lg px-4 py-2 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-36 pb-32 px-6 z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Animated badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] mb-10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            <span className="text-xs text-gray-400 font-sans">Live on mainnet</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.08] tracking-tight text-white">
            Your AI Personal Shopper.
          </h1>
          <p className="mt-7 text-lg sm:text-xl text-gray-500 max-w-xl mx-auto leading-relaxed font-sans">
            Let your agent search, compare, and buy — from any store on the web.
          </p>

          {/* Agent conversation demo */}
          <div className="mt-10 max-w-xl mx-auto">
            <HeroChatV2 />
          </div>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="group flex items-center gap-2.5 px-7 py-3.5 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-all hover:shadow-lg hover:shadow-white/10 text-sm"
            >
              Open Dashboard
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#developers"
              className="group flex items-center gap-2.5 px-7 py-3.5 border border-white/[0.1] text-gray-300 hover:text-white hover:border-white/[0.2] font-medium rounded-xl transition-all text-sm"
            >
              Connect Your Agent
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>

          <p className="mt-6 text-xs text-gray-600 font-sans">
            Powered by{' '}
            <a href="https://agents.karmapay.xyz" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-400 transition-colors">
              Karma Agent Wallet
            </a>
            {' '}· USDC → Fiat · Any AI agent
          </p>
        </div>
      </section>

      {/* ─── Scrolling logos ─── */}
      <section className="py-10 border-y border-white/[0.04] overflow-hidden z-10 relative">
        <div className="flex gap-12 animate-marquee whitespace-nowrap">
          {[...Array(2)].map((_, setIdx) => (
            <div key={setIdx} className="flex gap-12 items-center shrink-0">
              {['OpenClaw', 'ChatGPT', 'Claude', 'Gemini', 'Custom Agents', 'LangChain', 'AutoGPT', 'CrewAI'].map((name) => (
                <span key={`${name}-${setIdx}`} className="text-sm font-medium text-gray-700 tracking-wide">{name}</span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how" className="py-28 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <p className="text-sm text-gray-600 uppercase tracking-wider mb-14">How it works</p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-0">
            {[
              { n: '01', t: 'You talk', d: 'Tell your AI what you need in natural language.' },
              { n: '02', t: 'Agent searches', d: 'ClawCart searches retailers, flights, and hotels in real-time.' },
              { n: '03', t: 'Karma pays', d: 'USDC auto-converts to fiat. Spending limits enforced.' },
              { n: '04', t: 'Delivered', d: 'Order confirmed, tracking sent. All in one conversation.' },
            ].map((step, i) => (
              <FadeIn key={step.n} delay={i * 150}>
                <div className="relative p-6 border-l border-white/[0.06] group hover:border-white/[0.15] transition-colors">
                  {/* Hover glow */}
                  <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-r-xl" />
                  <span className="text-[10px] text-gray-700 relative">{step.n}</span>
                  <h3 className="text-lg font-bold text-white mt-2 relative">{step.t}</h3>
                  <p className="text-sm text-gray-500 mt-2 font-sans leading-relaxed relative">{step.d}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Architecture ─── */}
      <section id="architecture" className="py-28 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <FadeIn>
            <p className="text-sm text-gray-600 uppercase tracking-wider mb-14">Architecture</p>
          </FadeIn>

          <FadeIn delay={200}>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-10 md:p-14 relative overflow-hidden">
              {/* Subtle glow inside */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[300px] bg-white/[0.015] rounded-full blur-[100px] pointer-events-none" />

              {/* Flow diagram */}
              <div className="flex flex-col items-center gap-0 relative">
                <ArchBlock label="AI Agent" sublabel="OpenClaw · ChatGPT · Claude · Custom" />
                <VerticalConnector />
                <ArchBlock label="ClawCart API" sublabel="Search · Compare · Purchase · Track" accent />
                <VerticalConnector />
                <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
                  <ArchBlock label="Karma Wallet" sublabel="USDC → Fiat off-ramp" glow />
                  <ArchBlock label="Retailers" sublabel="150M+ merchants worldwide" />
                </div>
              </div>

              {/* Capability pills */}
              <div className="mt-14 flex flex-wrap justify-center gap-2 relative">
                {['Product search', 'Price comparison', 'Auto-checkout', 'Order tracking', 'Spending limits', 'Approval flows', 'USDC payments', 'Any AI agent'].map((cap) => (
                  <span key={cap} className="px-3.5 py-1.5 text-xs text-gray-500 border border-white/[0.06] rounded-full bg-white/[0.02] hover:border-white/[0.15] hover:text-gray-300 transition-all cursor-default">
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="py-20 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <FadeIn delay={0}>
              <div>
                <AnimatedNumber target="150M" suffix="+" />
                <p className="text-sm text-gray-600 mt-2 font-sans">Merchants</p>
              </div>
            </FadeIn>
            <FadeIn delay={150}>
              <div>
                <AnimatedNumber target="<30s" />
                <p className="text-sm text-gray-600 mt-2 font-sans">Search to Purchase</p>
              </div>
            </FadeIn>
            <FadeIn delay={300}>
              <div>
                <AnimatedNumber target="USDC" />
                <p className="text-sm text-gray-600 mt-2 font-sans">Native Payments</p>
              </div>
            </FadeIn>
            <FadeIn delay={450}>
              <div>
                <AnimatedNumber target="Any" />
                <p className="text-sm text-gray-600 mt-2 font-sans">AI Agent Compatible</p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Developers ─── */}
      <section id="developers" className="py-28 px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <FadeIn>
            <p className="text-sm text-gray-600 uppercase tracking-wider mb-14">For Developers</p>
          </FadeIn>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-start">
            <FadeIn delay={100}>
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight">
                  One skill file.<br />
                  Your agent learns<br />
                  everything.
                </h2>
                <p className="mt-6 text-gray-500 leading-relaxed font-sans text-[15px]">
                  ClawCart exposes a <code className="text-white bg-white/[0.06] px-1.5 py-0.5 rounded text-sm font-mono">skill.md</code> file.
                  Any agent reads it and instantly knows how to search, purchase, track orders, and check wallet balances.
                  No SDK. No boilerplate.
                </p>

                <div className="mt-10 space-y-5">
                  <DevFeature title="skill.md Discovery" description="Point your agent at /skill.md — it learns every endpoint and behavior guideline" />
                  <DevFeature title="5 Endpoints, Full Commerce" description="User profile, search, purchase, order status, wallet — everything an agent needs" />
                  <DevFeature title="Built-in Safety" description="Approval workflows, spending limits, and error handling defined in the skill" />
                </div>

                <div className="mt-10 flex gap-4">
                  <Link
                    href="/login"
                    className="group flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-all hover:shadow-lg hover:shadow-white/10 text-sm"
                  >
                    Register Your Agent
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <a
                    href="/skill.md"
                    target="_blank"
                    className="flex items-center gap-2 px-6 py-3 border border-white/[0.1] text-gray-400 hover:text-white hover:border-white/[0.2] font-medium rounded-xl transition-all text-sm"
                  >
                    View skill.md
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={300}>
              <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0a] overflow-hidden hover:border-white/[0.1] transition-colors">
                <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                      <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
                    </div>
                    <span className="text-gray-600 text-xs ml-2">skill.md</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
                    </span>
                    <span className="text-[10px] text-gray-600">live</span>
                  </div>
                </div>
                <pre className="p-6 text-[13px] leading-relaxed overflow-x-auto max-h-[480px] overflow-y-auto">
                  <code>
                    <span className="text-white font-bold">{'# ClawCart — Commerce Execution Skill\n\n'}</span>
                    <span className="text-gray-500">{'You are connected to **ClawCart**, the commerce\n'}</span>
                    <span className="text-gray-500">{'execution layer that lets you search, compare,\n'}</span>
                    <span className="text-gray-500">{'and purchase anything on the web.\n\n'}</span>
                    <span className="text-gray-400">{'## Base URL\n\n'}</span>
                    <span className="text-emerald-400/80">{'  https://api.clawcart.com/v1/agent\n\n'}</span>
                    <span className="text-gray-400">{'## Authentication\n\n'}</span>
                    <span className="text-gray-500">{'  Authorization: Bearer '}</span>
                    <span className="text-amber-400/70">{'{AGENT_TOKEN}\n\n'}</span>
                    <span className="text-gray-400">{'## Capabilities\n\n'}</span>
                    <span className="text-gray-300">{'### 1. Get User Profile\n'}</span>
                    <span className="text-gray-600">{'  GET /users/:id/profile\n'}</span>
                    <span className="text-gray-700">{'  → sizes, preferences, allergies\n\n'}</span>
                    <span className="text-gray-300">{'### 2. Search Products\n'}</span>
                    <span className="text-gray-600">{'  POST /search\n'}</span>
                    <span className="text-gray-700">{'  → products, flights, hotels\n\n'}</span>
                    <span className="text-gray-300">{'### 3. Initiate Purchase\n'}</span>
                    <span className="text-gray-600">{'  POST /purchase\n'}</span>
                    <span className="text-gray-700">{'  → auto-approve or pending\n\n'}</span>
                    <span className="text-gray-300">{'### 4. Check Order Status\n'}</span>
                    <span className="text-gray-600">{'  GET /orders/:orderId\n'}</span>
                    <span className="text-gray-700">{'  → tracking, delivery\n\n'}</span>
                    <span className="text-gray-300">{'### 5. Wallet Balance\n'}</span>
                    <span className="text-gray-600">{'  GET /wallet/:userId/balance\n'}</span>
                    <span className="text-gray-700">{'  → USDC balance, limits\n'}</span>
                  </code>
                </pre>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* ─── Roadmap ─── */}
      <section id="roadmap" className="py-28 px-6 relative z-10">
        <div className="max-w-3xl mx-auto">
          <FadeIn>
            <p className="text-sm text-gray-600 uppercase tracking-wider mb-14">Roadmap</p>
          </FadeIn>

          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-white/[0.1] via-white/[0.06] to-transparent" />

            <div className="space-y-10">
              <FadeIn delay={0}>
                <RoadmapItem
                  phase="Phase 1"
                  status="live"
                  title="Search & Compare"
                  description="AI agents search products, flights, and hotels across retailers. Geo-aware results, real-time pricing."
                />
              </FadeIn>
              <FadeIn delay={150}>
                <RoadmapItem
                  phase="Phase 2"
                  status="building"
                  title="Automated Checkout"
                  description="One-click purchase on any website. Browser automation handles forms, payments, and confirmations."
                />
              </FadeIn>
              <FadeIn delay={300}>
                <RoadmapItem
                  phase="Phase 3"
                  status="planned"
                  title="Enterprise Commerce Agents"
                  description="Dedicated agents for procurement teams. Role-based access, audit trails, and bulk purchasing at scale."
                />
              </FadeIn>
              <FadeIn delay={450}>
                <RoadmapItem
                  phase="Phase 4"
                  status="classified"
                  title="██████████"
                  description="▓▓▓▓▓▓▓▓ ▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓ ▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓"
                />
              </FadeIn>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-32 px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          {/* Glow behind CTA */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-white/[0.02] rounded-full blur-[100px] pointer-events-none" />

          <FadeIn>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight relative">
              Ready to give your agent<br />
              real purchasing power?
            </h2>
            <p className="mt-5 text-gray-500 font-sans text-[15px] max-w-lg mx-auto relative">
              Products, flights, hotels, food — manage it all from your dashboard or connect your agent via our API.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 relative">
              <Link
                href="/dashboard"
                className="group flex items-center gap-2.5 px-8 py-4 bg-white text-black font-semibold rounded-xl hover:bg-gray-200 transition-all hover:shadow-lg hover:shadow-white/10"
              >
                Open Dashboard
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#developers"
                className="group flex items-center gap-2.5 px-8 py-4 border border-white/[0.1] text-gray-300 hover:text-white hover:border-white/[0.2] font-medium rounded-xl transition-all"
              >
                Connect Your Agent
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/[0.04] py-10 px-6 relative z-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-white flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#060606" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            </div>
            <span className="text-sm text-gray-600">© {new Date().getFullYear()} ClawCart</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-gray-600">
            <a href="https://agents.karmapay.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">
              Karma Wallet
            </a>
            <a href="/skill.md" target="_blank" className="hover:text-gray-400 transition-colors">
              skill.md
            </a>
            <Link href="/login" className="hover:text-gray-400 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Sub-components ─── */

function ArchBlock({ label, sublabel, accent, glow }: { label: string; sublabel: string; accent?: boolean; glow?: boolean }) {
  return (
    <div className={`relative rounded-xl border px-8 py-5 text-center min-w-[220px] transition-all duration-300 hover:scale-[1.02] group ${
      accent
        ? 'border-white/[0.15] bg-white/[0.05]'
        : 'border-white/[0.08] bg-white/[0.03]'
    }`}>
      {glow && <div className="absolute -inset-px rounded-xl bg-emerald-500/10 blur-sm opacity-0 group-hover:opacity-100 transition-opacity" />}
      <p className={`font-bold text-sm relative ${accent ? 'text-white' : 'text-gray-300'}`}>{label}</p>
      <p className="text-[11px] text-gray-600 mt-1 relative">{sublabel}</p>
    </div>
  );
}

function VerticalConnector() {
  return (
    <div className="relative w-px h-10 bg-white/[0.06]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/20 animate-pulse" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/20 animate-pulse" style={{ animationDelay: '0.5s' }} />
    </div>
  );
}

function DevFeature({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 group">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-2 shrink-0 group-hover:bg-white transition-colors" />
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-sm text-gray-600 mt-0.5 font-sans">{description}</p>
      </div>
    </div>
  );
}

function RoadmapItem({ phase, status, title, description }: { phase: string; status: 'live' | 'building' | 'planned' | 'classified'; title: string; description: string }) {
  const isClassified = status === 'classified';

  return (
    <div className={`flex items-start gap-5 pl-0 ${isClassified ? 'group cursor-default' : ''}`}>
      {/* Dot */}
      <div className="relative shrink-0 mt-1.5">
        {status === 'live' ? (
          <span className="relative flex h-[15px] w-[15px]">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex rounded-full h-[15px] w-[15px] bg-emerald-400 border-2 border-[#060606]" />
          </span>
        ) : status === 'building' ? (
          <span className="relative flex h-[15px] w-[15px]">
            <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/20 animate-pulse" />
            <span className="relative inline-flex rounded-full h-[15px] w-[15px] bg-amber-400/80 border-2 border-[#060606]" />
          </span>
        ) : status === 'classified' ? (
          <span className="relative flex h-[15px] w-[15px]">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-500/20 animate-pulse" />
            <span className="relative inline-flex rounded-full h-[15px] w-[15px] bg-red-500/80 border-2 border-[#060606]" />
          </span>
        ) : (
          <span className="inline-flex rounded-full h-[15px] w-[15px] bg-white/[0.1] border-2 border-[#060606]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 -mt-0.5">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-[11px] text-gray-600 uppercase tracking-wider">{phase}</span>
          {status === 'live' && (
            <span className="text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">Live</span>
          )}
          {status === 'building' && (
            <span className="text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">In Progress</span>
          )}
          {status === 'classified' && (
            <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 animate-pulse tracking-widest">
              ■ CLASSIFIED
            </span>
          )}
        </div>
        <h3 className={`text-base font-bold ${isClassified ? 'text-red-400/30 select-none blur-[2px]' : 'text-white'}`}>{title}</h3>
        <p className={`text-sm mt-1 font-sans leading-relaxed ${isClassified ? 'text-gray-700 select-none blur-[3px]' : 'text-gray-500'}`}>{description}</p>
        {isClassified && (
          <p className="text-[11px] text-red-400/50 mt-2 font-mono tracking-wide">
            🔒 Clearance level required. Stay tuned.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── HeroChat V2 — Animated conversation demo ─── */

interface ChatLine {
  role: 'human' | 'agent' | 'results';
  text: string;
  results?: { label: string; detail: string; price: string; highlight?: boolean }[];
}

const SCENARIOS: { lines: ChatLine[] }[] = [
  {
    lines: [
      { role: 'human', text: 'Find me wireless headphones under €100' },
      { role: 'agent', text: 'Searching Dutch retailers for wireless headphones...' },
      {
        role: 'results', text: '',
        results: [
          { label: 'Sony WH-CH720N', detail: 'MediaMarkt · ⭐ 4.6', price: '€79.99', highlight: true },
          { label: 'JBL Tune 770NC', detail: 'Bol · ⭐ 4.5', price: '€83.99' },
          { label: 'Philips TAH5206', detail: 'Coolblue · ⭐ 4.3', price: '€49.99' },
        ],
      },
      { role: 'human', text: 'Get the Sony ones' },
      { role: 'agent', text: '✅ Ordered! Sony WH-CH720N — €79.99 via Karma Wallet. Arriving Thursday.' },
    ],
  },
  {
    lines: [
      { role: 'human', text: 'Book me a flight to Amsterdam next Friday' },
      { role: 'agent', text: 'Searching flights to Amsterdam for Feb 21...' },
      {
        role: 'results', text: '',
        results: [
          { label: 'KLM — direct, 3h 10m', detail: 'Departs 11:45 AM', price: '€129', highlight: true },
          { label: 'Wizz Air — direct, 3h 15m', detail: 'Departs 6:30 AM', price: '€49' },
          { label: 'Ryanair — 1 stop, 5h 40m', detail: 'Departs 8:00 AM', price: '€42' },
        ],
      },
      { role: 'human', text: 'Book the Wizz Air flight' },
      { role: 'agent', text: '✅ Booked! Wizz Air → Amsterdam, Feb 21 6:30 AM. €49 paid with USDC.' },
    ],
  },
  {
    lines: [
      { role: 'human', text: 'Find a hotel near La Rambla under €150/night' },
      { role: 'agent', text: 'Searching hotels near La Rambla, Barcelona...' },
      {
        role: 'results', text: '',
        results: [
          { label: 'Hotel Catalonia Ramblas', detail: '4★ · 0.2 km', price: '€128/n', highlight: true },
          { label: 'Citadines Ramblas', detail: '3★ · 0.4 km', price: '€95/n' },
          { label: 'Hotel Continental BCN', detail: '3★ · On La Rambla', price: '€112/n' },
        ],
      },
      { role: 'human', text: 'Book the Catalonia for 2 nights' },
      { role: 'agent', text: '✅ Reserved! Catalonia Ramblas, 2 nights — €256 total. Confirmation #HR-8291.' },
    ],
  },
  {
    lines: [
      { role: 'human', text: 'Buy me the latest AirPods' },
      { role: 'agent', text: 'Searching for AirPods across retailers...' },
      {
        role: 'results', text: '',
        results: [
          { label: 'AirPods Pro 2 (USB-C)', detail: 'Apple Store · ⭐ 4.8', price: '€279', highlight: true },
          { label: 'AirPods 4 with ANC', detail: 'MediaMarkt · ⭐ 4.6', price: '€199' },
          { label: 'AirPods 4', detail: 'Bol · ⭐ 4.5', price: '€149' },
        ],
      },
      { role: 'human', text: 'Get the AirPods Pro 2' },
      { role: 'agent', text: '✅ Ordered! AirPods Pro 2 — €279 from Apple Store. Arriving Wednesday.' },
    ],
  },
];

const CHAR_DELAY = 25;
const LINE_PAUSE = 600;
const RESULTS_PAUSE = 400;
const SCENARIO_PAUSE = 3000;
const FADE_DURATION = 500;

/* Animated results card — rows slide in one by one */
function ResultsCard({ results }: { results: { label: string; detail: string; price: string; highlight?: boolean }[] }) {
  const [visibleRows, setVisibleRows] = useState(0);

  useEffect(() => {
    setVisibleRows(0);
    const timers: NodeJS.Timeout[] = [];
    results.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleRows(i + 1), 120 * (i + 1)));
    });
    return () => timers.forEach(clearTimeout);
  }, [results]);

  return (
    <div
      className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-3.5 overflow-hidden"
      style={{ animation: 'results-card-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
    >
      <div
        className="text-[10px] text-gray-600 uppercase tracking-wider mb-2.5"
        style={{ animation: 'chat-line-in 0.3s ease-out both' }}
      >
        Results
      </div>
      <div className="space-y-0">
        {results.map((r, ri) => (
          <div
            key={ri}
            className={`flex justify-between items-center py-1.5 transition-all duration-500 ${
              ri < visibleRows ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
            } ${r.highlight ? 'text-white' : 'text-gray-500'}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-gray-600 text-[11px] w-4 shrink-0">{ri + 1}.</span>
              <span className="truncate">{r.label}</span>
              <span className="text-gray-700 text-[11px] hidden sm:inline">{r.detail}</span>
            </div>
            <span className={`shrink-0 ml-3 transition-colors duration-300 ${r.highlight ? 'text-emerald-400' : 'text-gray-600'}`}>
              {r.price}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroChatV2() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [visibleLines, setVisibleLines] = useState<ChatLine[]>([]);
  const [currentText, setCurrentText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [fading, setFading] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [visibleLines, currentText]);

  const typeText = useCallback((text: string, onComplete: () => void) => {
    let i = 0;
    setCurrentText('');
    setIsTyping(true);
    const type = () => {
      if (i < text.length) {
        setCurrentText(text.substring(0, i + 1));
        i++;
        timeoutRef.current = setTimeout(type, CHAR_DELAY);
      } else {
        setIsTyping(false);
        onComplete();
      }
    };
    type();
  }, []);

  const playScenario = useCallback((scenario: { lines: ChatLine[] }) => {
    const lines = scenario.lines;
    let lineIdx = 0;

    const processLine = () => {
      if (lineIdx >= lines.length) {
        timeoutRef.current = setTimeout(() => {
          setFading(true);
          timeoutRef.current = setTimeout(() => {
            setFading(false);
            setVisibleLines([]);
            setCurrentText('');
            setScenarioIdx((prev) => (prev + 1) % SCENARIOS.length);
          }, FADE_DURATION);
        }, SCENARIO_PAUSE);
        return;
      }

      const line = lines[lineIdx];

      if (line.role === 'results') {
        timeoutRef.current = setTimeout(() => {
          setVisibleLines((prev) => [...prev, line]);
          lineIdx++;
          timeoutRef.current = setTimeout(processLine, LINE_PAUSE);
        }, RESULTS_PAUSE);
      } else {
        typeText(line.text, () => {
          setVisibleLines((prev) => [...prev, { ...line, text: line.text }]);
          setCurrentText('');
          lineIdx++;
          timeoutRef.current = setTimeout(processLine, LINE_PAUSE);
        });
      }
    };

    processLine();
  }, [typeText]);

  useEffect(() => {
    playScenario(SCENARIOS[scenarioIdx]);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [scenarioIdx, playScenario]);

  const scenario = SCENARIOS[scenarioIdx];
  const nextLineIdx = visibleLines.length;
  const currentRole = nextLineIdx < scenario.lines.length ? scenario.lines[nextLineIdx].role : null;

  const Cursor = () => (
    <span className={`inline-block w-[2px] h-[14px] ml-[1px] align-middle transition-opacity ${cursorVisible ? 'bg-white' : 'bg-transparent'}`} />
  );

  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-[#0a0a0a] overflow-hidden transition-opacity duration-500 shadow-2xl shadow-black/50 ${fading ? 'opacity-0' : 'opacity-100'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.04]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
            <div className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
          </div>
          <span className="text-gray-600 text-xs ml-2">clawcart — agent session</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          <span className="text-[10px] text-gray-600">live</span>
        </div>
      </div>

      {/* Chat area */}
      <div ref={containerRef} className="p-5 space-y-3.5 text-[13px] min-h-[290px] max-h-[290px] overflow-hidden">
        {visibleLines.map((line, i) => {
          if (line.role === 'results' && line.results) {
            return (
              <ResultsCard key={i} results={line.results} />
            );
          }

          return (
            <div
              key={i}
              className="flex gap-2.5"
              style={{ animation: 'chat-line-in 0.35s ease-out both' }}
            >
              <span className={`shrink-0 font-medium ${line.role === 'human' ? 'text-gray-500' : 'text-emerald-400/80'}`}>
                {line.role === 'human' ? 'you' : 'agent'}
              </span>
              <span className={
                line.role === 'human'
                  ? 'text-gray-300'
                  : line.text.startsWith('✅')
                  ? 'text-emerald-300/90'
                  : 'text-gray-500'
              }>
                {line.text}
              </span>
            </div>
          );
        })}

        {/* Currently typing */}
        {currentText && currentRole && currentRole !== 'results' && (
          <div className="flex gap-2.5">
            <span className={`shrink-0 font-medium ${currentRole === 'human' ? 'text-gray-500' : 'text-emerald-400/80'}`}>
              {currentRole === 'human' ? 'you' : 'agent'}
            </span>
            <span className={currentRole === 'human' ? 'text-gray-300' : 'text-gray-500'}>
              {currentText}
              <Cursor />
            </span>
          </div>
        )}

        {/* Idle cursor */}
        {!currentText && !isTyping && visibleLines.length === 0 && !fading && (
          <div className="flex gap-2.5">
            <span className="text-gray-500 shrink-0 font-medium">you</span>
            <span><Cursor /></span>
          </div>
        )}
      </div>
    </div>
  );
}
