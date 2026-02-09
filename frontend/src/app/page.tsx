import Link from 'next/link';
import {
  Zap,
  Search,
  Wallet,
  Shield,
  BarChart3,
  ArrowRight,
  Bot,
  User,
  Globe,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Package,
  TrendingUp,
  Lock,
  RefreshCw,
  Layers,
} from 'lucide-react';

/* ─── Scrolling use-case data ─── */

const ROW_1 = [
  { icon: '✈️', label: 'Book flights and hotels' },
  { icon: '🔍', label: 'Find best prices online' },
  { icon: '🛡️', label: 'Compare insurance quotes' },
  { icon: '🧾', label: 'Track expenses and receipts' },
  { icon: '🍕', label: 'Order food delivery' },
  { icon: '📦', label: 'Reorder essentials automatically' },
  { icon: '💊', label: 'Refill prescriptions' },
  { icon: '🎁', label: 'Find perfect gift ideas' },
  { icon: '🏨', label: 'Reserve hotel rooms' },
  { icon: '📱', label: 'Compare phone plans' },
];

const ROW_2 = [
  { icon: '🏷️', label: 'Find discount codes' },
  { icon: '📉', label: 'Price-drop alerts' },
  { icon: '⚖️', label: 'Compare product specs' },
  { icon: '📋', label: 'Manage subscriptions' },
  { icon: '⏰', label: 'Remind you of deadlines' },
  { icon: '🎫', label: 'Buy concert tickets' },
  { icon: '🚗', label: 'Rent a car anywhere' },
  { icon: '🏖️', label: 'Plan weekend getaways' },
  { icon: '👟', label: 'Shop for sneakers' },
  { icon: '🧴', label: 'Order skincare products' },
];

const ROW_3 = [
  { icon: '🎵', label: 'Get event tickets' },
  { icon: '🛒', label: 'Grocery shopping' },
  { icon: '💻', label: 'Shop for electronics' },
  { icon: '🏋️', label: 'Find fitness gear' },
  { icon: '🍽️', label: 'Book restaurant reservations' },
  { icon: '📚', label: 'Order textbooks' },
  { icon: '🎮', label: 'Buy games and consoles' },
  { icon: '☕', label: 'Subscribe to coffee beans' },
  { icon: '🧳', label: 'Book travel packages' },
  { icon: '💐', label: 'Send flowers' },
];

const ROW_4 = [
  { icon: '🏠', label: 'Order home essentials' },
  { icon: '👶', label: 'Shop baby products' },
  { icon: '🐕', label: 'Order pet supplies' },
  { icon: '🧹', label: 'Book cleaning services' },
  { icon: '🔧', label: 'Find home repair services' },
  { icon: '📸', label: 'Buy camera gear' },
  { icon: '🎨', label: 'Order art supplies' },
  { icon: '🧘', label: 'Book wellness sessions' },
  { icon: '🚲', label: 'Shop cycling gear' },
  { icon: '🌱', label: 'Order plants and seeds' },
];

const ROW_5 = [
  { icon: '⚽', label: 'Buy sports tickets' },
  { icon: '🎭', label: 'Book theater shows' },
  { icon: '🏔️', label: 'Plan adventure trips' },
  { icon: '💎', label: 'Shop jewelry' },
  { icon: '👔', label: 'Order custom suits' },
  { icon: '🍷', label: 'Buy wine and spirits' },
  { icon: '🎧', label: 'Shop headphones' },
  { icon: '📺', label: 'Compare TV deals' },
  { icon: '🧊', label: 'Meal kit delivery' },
  { icon: '🎓', label: 'Buy online courses' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 w-full z-50 glass-dark border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/20">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Swiftbuy</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#use-cases" className="hover:text-white transition-colors">
              Use Cases
            </a>
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#developers" className="hover:text-white transition-colors">
              For Developers
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-400 hover:text-white transition-colors px-4 py-2"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium text-white bg-brand-600 hover:bg-brand-500 rounded-xl px-5 py-2.5 transition-colors shadow-lg shadow-brand-600/20"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─── */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-brand-950/50 to-gray-950" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-brand-500/5 rounded-full blur-3xl" />
        <div className="absolute top-40 right-0 w-[400px] h-[400px] bg-purple-500/5 rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-brand-400 text-sm font-medium mb-8">
              <span className="flex h-2 w-2 rounded-full bg-brand-500 animate-pulse-soft" />
              The commerce execution layer for AI agents
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight">
              Your AI agent can now{' '}
              <span className="gradient-text from-brand-400 to-purple-400">
                buy anything
              </span>{' '}
              on the web
            </h1>

            <p className="mt-6 text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Swiftbuy is the middleware that lets any AI agent search, compare, and
              purchase anything — products, flights, hotels, food, tickets — powered by{' '}
              <span className="text-white font-medium">USDC</span> with automatic
              off-ramping.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-brand-600 to-brand-700 text-white font-semibold rounded-2xl shadow-xl shadow-brand-600/25 hover:shadow-2xl hover:shadow-brand-600/30 transition-all text-lg"
              >
                <User className="h-5 w-5" />
                Open Dashboard
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#developers"
                className="group flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-2xl hover:bg-white/10 transition-all text-lg"
              >
                <Bot className="h-5 w-5" />
                Connect Your Agent
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            <p className="mt-5 text-sm text-gray-500">
              No credit card needed · USDC payments · Products, flights, hotels & more · Any AI agent
            </p>
          </div>

          {/* Hero Visual — Conversation Mock */}
          <div className="mt-16 max-w-3xl mx-auto">
            <div className="bg-black/60 rounded-3xl shadow-2xl shadow-black/30 overflow-hidden border border-white/10">
              {/* Terminal header */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <span className="text-gray-500 text-xs font-mono ml-2">swiftbuy — agent session</span>
              </div>
              {/* Conversation */}
              <div className="p-6 space-y-5 font-mono text-sm">
                <div className="flex gap-3">
                  <span className="text-purple-400 shrink-0">You:</span>
                  <span className="text-gray-300">Book me a flight to Barcelona next Friday, return Monday</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-400 shrink-0">Agent:</span>
                  <span className="text-gray-500">Searching flights SFO → BCN, Feb 14–17...</span>
                </div>
                <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                  <div className="text-gray-600 text-xs mb-3">SWIFTBUY RESULTS — FLIGHTS</div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-gray-300">
                      <span>1. Delta — 1 stop, 12h 40m</span>
                      <span className="text-green-400">$487.00</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>2. United — nonstop, 10h 55m</span>
                      <span className="text-green-400">$512.00</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>3. Iberia — nonstop, 11h 10m</span>
                      <span className="text-yellow-400">$539.00</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-purple-400 shrink-0">You:</span>
                  <span className="text-gray-300">Book the United nonstop. Also find me a hotel near La Rambla</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-400 shrink-0">Agent:</span>
                  <span className="text-gray-500">
                    ✅ Flight booked! $512.00 USDC → off-ramped → confirmed on United.
                    <br />
                    <span className="text-gray-600">Conf: UA-7291840 · Searching hotels now...</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Logos / Trust bar ─── */}
      <section className="py-12 border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <p className="text-center text-sm font-medium text-gray-600 mb-6">
            BUILT TO WORK WITH ANY AI AGENT
          </p>
          <div className="flex items-center justify-center gap-12 flex-wrap text-gray-600">
            <span className="text-lg font-bold">OpenClawd</span>
            <span className="text-lg font-bold">ChatGPT</span>
            <span className="text-lg font-bold">Claude</span>
            <span className="text-lg font-bold">Gemini</span>
            <span className="text-lg font-bold">Custom Agents</span>
          </div>
        </div>
      </section>

      {/* ─── How It Works ─── */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-brand-400 uppercase tracking-wider mb-3">
              How It Works
            </p>
            <h2 className="text-4xl font-bold text-white">
              From conversation to confirmation in 4 steps
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
              Your AI agent handles everything — shopping, booking, ordering. You just talk.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <StepCard
              step={1}
              icon={MessageSquare}
              title="You Talk"
              description={'"Book me a flight to Tokyo next week" or "Order me running shoes, size 10."'}
              color="brand"
            />
            <StepCard
              step={2}
              icon={Search}
              title="Agent Searches"
              description="Swiftbuy searches across airlines, hotels, retailers, and services in real-time."
              color="purple"
            />
            <StepCard
              step={3}
              icon={CreditCard}
              title="USDC Off-Ramps"
              description="Your USDC is automatically converted to fiat to pay the provider. No cards needed."
              color="green"
            />
            <StepCard
              step={4}
              icon={Package}
              title="Confirmed"
              description="Booking confirmed, tracking provided. Flights ticketed, packages shipped, reservations set."
              color="orange"
            />
          </div>

          {/* Architecture diagram */}
          <div className="mt-20 bg-white/[0.03] rounded-3xl p-8 md:p-12 border border-white/5">
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-8 text-center">
              Architecture
            </p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 text-sm">
              <ArchBlock icon={User} label="User" sublabel="Natural language" />
              <ChevronRight className="h-5 w-5 text-gray-700 rotate-90 md:rotate-0" />
              <ArchBlock icon={Bot} label="AI Agent" sublabel="OpenClawd / GPT / Claude" />
              <ChevronRight className="h-5 w-5 text-gray-700 rotate-90 md:rotate-0" />
              <div className="bg-gradient-to-br from-brand-600 to-brand-700 text-white rounded-2xl p-5 text-center shadow-lg shadow-brand-600/20 min-w-[160px]">
                <Zap className="h-6 w-6 mx-auto mb-2" />
                <p className="font-bold">Swiftbuy API</p>
                <p className="text-brand-200 text-xs mt-1">Search · Purchase · Wallet</p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-700 rotate-90 md:rotate-0" />
              <div className="flex flex-col gap-3">
                <ArchBlock icon={Globe} label="Providers" sublabel="Retailers · Airlines · Hotels" />
                <ArchBlock icon={Wallet} label="Wallet API" sublabel="USDC → Fiat" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Use Cases — Scrolling Rows ─── */}
      <section id="use-cases" className="py-24 overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 text-center mb-14">
          <p className="text-sm font-semibold text-brand-400 uppercase tracking-wider mb-3">
            Use Cases
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-white">
            What can Swiftbuy do for you?
          </h2>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            One platform, thousands of use cases
          </p>
        </div>

        {/* Scrolling rows */}
        <div className="scroll-container space-y-4">
          <ScrollRow items={ROW_1} direction="left" speed="normal" />
          <ScrollRow items={ROW_2} direction="right" speed="slow" />
          <ScrollRow items={ROW_3} direction="left" speed="fast" />
          <ScrollRow items={ROW_4} direction="right" speed="normal" />
          <ScrollRow items={ROW_5} direction="left" speed="slow" />
        </div>

        <p className="text-center text-sm text-gray-600 italic mt-10">
          Your AI agent can handle any purchase — just ask in natural language
        </p>
      </section>

      {/* ─── Features ─── */}
      <section id="features" className="py-24 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-brand-400 uppercase tracking-wider mb-3">
              Features
            </p>
            <h2 className="text-4xl font-bold text-white">
              Everything you need for AI-powered commerce
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Search}
              title="Universal Search"
              description="Real-time search across retailers, airlines, hotels, restaurants, and ticket platforms. Prices compared side by side."
            />
            <FeatureCard
              icon={Wallet}
              title="USDC Wallet Integration"
              description="Pay with USDC from your virtual wallet. Automatic off-ramping to fiat at checkout — no credit cards."
            />
            <FeatureCard
              icon={Shield}
              title="Approval Workflows"
              description="Set spending limits and require approval for purchases above a threshold. You're always in control."
            />
            <FeatureCard
              icon={TrendingUp}
              title="Intelligence Engine"
              description="The platform learns your preferences, favorite brands, and price sensitivity to make better recommendations."
            />
            <FeatureCard
              icon={Package}
              title="Order Tracking"
              description="Track every order from purchase to delivery. Full transparency on what your agents buy."
            />
            <FeatureCard
              icon={BarChart3}
              title="User Dashboard"
              description="Beautiful dashboard showing spending analytics, transaction history, pending approvals, and insights."
            />
            <FeatureCard
              icon={Lock}
              title="Spending Controls"
              description="Daily and monthly spending limits. Auto-approve thresholds. Full audit logs for every transaction."
            />
            <FeatureCard
              icon={RefreshCw}
              title="Automated Checkout"
              description="Headless browser automation handles the entire checkout process. Add to cart → pay → confirm."
            />
            <FeatureCard
              icon={Layers}
              title="Agent-Agnostic API"
              description="RESTful API that works with any AI agent. OpenClawd, ChatGPT, Claude, or your custom bot."
            />
          </div>
        </div>
      </section>

      {/* ─── For Developers / Connect Agent ─── */}
      <section id="developers" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sm font-semibold text-brand-400 uppercase tracking-wider mb-3">
                Connect via OpenClaw
              </p>
              <h2 className="text-4xl font-bold leading-tight text-white">
                One skill file.<br />Your agent learns everything.
              </h2>
              <p className="mt-4 text-lg text-gray-400 leading-relaxed">
                Swiftbuy exposes a <code className="text-brand-400 bg-white/5 px-1.5 py-0.5 rounded text-base">skill.md</code> that
                any OpenClaw agent reads to learn how to search, purchase, track orders,
                and manage your wallet. No SDK. No boilerplate. Just point your agent at
                the skill file and go.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-white">skill.md Discovery</p>
                    <p className="text-sm text-gray-500">
                      Your agent fetches <code className="text-gray-400">/skill.md</code> and instantly knows every endpoint, auth method, and behavior guideline
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-white">5 Endpoints, Full Commerce</p>
                    <p className="text-sm text-gray-500">
                      User profile, search, purchase, order status, wallet balance — everything an agent needs
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-white">Context-Aware Shopping</p>
                    <p className="text-sm text-gray-500">
                      The skill tells agents to read your sizes, preferences, and allergies before buying — no miscommunication
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-white">Built-in Safety</p>
                    <p className="text-sm text-gray-500">
                      Approval workflows, spending limits, and error handling are defined in the skill so agents always behave correctly
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex gap-4">
                <Link
                  href="/login"
                  className="group flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-500 text-white font-semibold rounded-xl transition-colors"
                >
                  <Bot className="h-5 w-5" />
                  Register Your Agent
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a
                  href="/skill.md"
                  target="_blank"
                  className="flex items-center gap-2 px-6 py-3 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white font-medium rounded-xl transition-colors"
                >
                  View skill.md
                </a>
              </div>
            </div>

            {/* Skill.md preview */}
            <div className="bg-black/40 rounded-2xl overflow-hidden border border-white/10">
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                  </div>
                  <span className="text-gray-500 text-xs font-mono ml-2">
                    skill.md
                  </span>
                </div>
                <span className="text-xs text-gray-600 font-mono">
                  your-domain.com/skill.md
                </span>
              </div>
              <pre className="p-6 text-sm font-mono leading-relaxed overflow-x-auto max-h-[480px] overflow-y-auto">
                <code>
                  <span className="text-purple-400 font-bold">{'# Swiftbuy — Commerce Execution Skill\n\n'}</span>
                  <span className="text-gray-400">{'You are connected to **Swiftbuy**, the commerce\n'}</span>
                  <span className="text-gray-400">{'execution layer that lets you search, compare,\n'}</span>
                  <span className="text-gray-400">{'and purchase anything on the web on behalf of\n'}</span>
                  <span className="text-gray-400">{'the user.\n\n'}</span>
                  <span className="text-blue-400">{'## Base URL\n\n'}</span>
                  <span className="text-green-400">{'  https://your-domain.com/api/v1/agent\n\n'}</span>
                  <span className="text-blue-400">{'## Authentication\n\n'}</span>
                  <span className="text-gray-400">{'  Authorization: Bearer '}</span>
                  <span className="text-yellow-400">{'{{AGENT_TOKEN}}\n\n'}</span>
                  <span className="text-blue-400">{'## Capabilities\n\n'}</span>
                  <span className="text-cyan-400">{'### 1. Get User Profile\n'}</span>
                  <span className="text-gray-500">{'  GET /api/v1/agent/users/:id/profile\n'}</span>
                  <span className="text-gray-600">{'  → sizes, preferences, allergies, addresses\n\n'}</span>
                  <span className="text-cyan-400">{'### 2. Search Products & Services\n'}</span>
                  <span className="text-gray-500">{'  POST /api/v1/agent/search\n'}</span>
                  <span className="text-gray-600">{'  → products, flights, hotels, food, events\n\n'}</span>
                  <span className="text-cyan-400">{'### 3. Initiate Purchase\n'}</span>
                  <span className="text-gray-500">{'  POST /api/v1/agent/purchase\n'}</span>
                  <span className="text-gray-600">{'  → auto-approve or pending_approval\n\n'}</span>
                  <span className="text-cyan-400">{'### 4. Check Order Status\n'}</span>
                  <span className="text-gray-500">{'  GET /api/v1/agent/orders/:orderId\n'}</span>
                  <span className="text-gray-600">{'  → tracking, status history, delivery\n\n'}</span>
                  <span className="text-cyan-400">{'### 5. Check Wallet Balance\n'}</span>
                  <span className="text-gray-500">{'  GET /api/v1/agent/wallet/:userId/balance\n'}</span>
                  <span className="text-gray-600">{'  → USDC balance, spending limits\n\n'}</span>
                  <span className="text-blue-400">{'## Behavior Guidelines\n\n'}</span>
                  <span className="text-gray-500">{'  1. Always fetch user profile first\n'}</span>
                  <span className="text-gray-500">{'  2. Present options before buying\n'}</span>
                  <span className="text-gray-500">{'  3. Mention prices clearly\n'}</span>
                  <span className="text-gray-500">{'  4. Respect approval thresholds\n'}</span>
                  <span className="text-gray-500">{'  5. Handle dietary/allergy info\n'}</span>
                  <span className="text-gray-500">{'  ...\n'}</span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats ─── */}
      <section className="py-20 bg-gradient-to-r from-brand-600 to-brand-800 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <p className="text-4xl md:text-5xl font-bold">100%</p>
              <p className="text-brand-200 mt-2">Transparent</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-bold">USDC</p>
              <p className="text-brand-200 mt-2">Native Payments</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-bold">&lt;30s</p>
              <p className="text-brand-200 mt-2">Search to Purchase</p>
            </div>
            <div>
              <p className="text-4xl md:text-5xl font-bold">Any</p>
              <p className="text-brand-200 mt-2">AI Agent Compatible</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ─── */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
            Ready to give your AI agent<br />
            <span className="gradient-text from-brand-400 to-purple-400">
              real-world purchasing power?
            </span>
          </h2>
          <p className="mt-6 text-xl text-gray-400 max-w-2xl mx-auto">
            Products, flights, hotels, food, event tickets — manage it all from your
            dashboard or connect your agent via our API.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-brand-600 to-brand-700 text-white font-semibold rounded-2xl shadow-xl shadow-brand-600/25 hover:shadow-2xl hover:shadow-brand-600/30 transition-all text-lg"
            >
              <User className="h-5 w-5" />
              Open Dashboard
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#developers"
              className="group flex items-center gap-3 px-8 py-4 bg-white/5 border border-white/10 text-white font-semibold rounded-2xl hover:bg-white/10 transition-all text-lg"
            >
              <Bot className="h-5 w-5" />
              Connect Your Agent
              <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="border-t border-white/5 bg-black/30">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
                  <Zap className="h-4 w-4 text-white" />
                </div>
                <span className="text-lg font-bold text-white">Swiftbuy</span>
              </div>
              <p className="mt-3 text-sm text-gray-500 leading-relaxed">
                The universal commerce execution layer for AI agents. Products, travel, food, and beyond.
              </p>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Product</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#how-it-works" className="hover:text-gray-300 transition-colors">How It Works</a></li>
                <li><a href="#features" className="hover:text-gray-300 transition-colors">Features</a></li>
                <li><a href="#use-cases" className="hover:text-gray-300 transition-colors">Use Cases</a></li>
                <li><a href="#developers" className="hover:text-gray-300 transition-colors">API Docs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Platform</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/dashboard" className="hover:text-gray-300 transition-colors">Dashboard</Link></li>
                <li><Link href="/login" className="hover:text-gray-300 transition-colors">Sign In</Link></li>
                <li><a href="#developers" className="hover:text-gray-300 transition-colors">Agent Integration</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><a href="#" className="hover:text-gray-300 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-gray-300 transition-colors">Security</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-600">
              © {new Date().getFullYear()} Swiftbuy. All rights reserved.
            </p>
            <p className="text-sm text-gray-600">
              Powered by USDC · Built for the AI agent economy
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Scrolling Row Component ─── */

function ScrollRow({
  items,
  direction,
  speed,
}: {
  items: { icon: string; label: string }[];
  direction: 'left' | 'right';
  speed: 'slow' | 'normal' | 'fast';
}) {
  const speedClass =
    direction === 'left'
      ? speed === 'slow'
        ? 'scroll-row-left-slow'
        : speed === 'fast'
        ? 'scroll-row-left-fast'
        : 'scroll-row-left'
      : speed === 'slow'
      ? 'scroll-row-right-slow'
      : 'scroll-row-right';

  // Duplicate for seamless loop
  const doubled = [...items, ...items];

  return (
    <div className="relative overflow-hidden">
      {/* Edge fades */}
      <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-gray-950 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-gray-950 to-transparent z-10 pointer-events-none" />

      <div className={`flex gap-3 w-max ${speedClass}`}>
        {doubled.map((item, i) => (
          <div
            key={`${item.label}-${i}`}
            className="flex items-center gap-2.5 px-5 py-3 bg-white/[0.04] border border-white/[0.06] rounded-full text-sm text-gray-400 whitespace-nowrap hover:bg-white/[0.08] hover:text-gray-200 hover:border-white/10 transition-all cursor-default shrink-0"
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function StepCard({
  step,
  icon: Icon,
  title,
  description,
  color,
}: {
  step: number;
  icon: any;
  title: string;
  description: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: 'from-brand-500 to-brand-600',
    purple: 'from-purple-500 to-purple-600',
    green: 'from-emerald-500 to-emerald-600',
    orange: 'from-orange-500 to-orange-600',
  };

  return (
    <div className="relative text-center">
      <div
        className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center mx-auto shadow-lg`}
      >
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="absolute -top-2 -right-2 md:right-auto md:left-1/2 md:translate-x-5 md:-translate-y-0 w-7 h-7 rounded-full bg-white text-gray-900 text-xs font-bold flex items-center justify-center">
        {step}
      </div>
      <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white/[0.03] rounded-2xl p-6 border border-white/[0.06] hover:border-brand-500/30 hover:bg-white/[0.05] transition-all group">
      <div className="w-11 h-11 rounded-xl bg-brand-500/10 group-hover:bg-brand-500/20 flex items-center justify-center transition-colors">
        <Icon className="h-5 w-5 text-brand-400" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
      <p className="mt-2 text-sm text-gray-400 leading-relaxed">{description}</p>
    </div>
  );
}

function ArchBlock({
  icon: Icon,
  label,
  sublabel,
}: {
  icon: any;
  label: string;
  sublabel: string;
}) {
  return (
    <div className="bg-white/[0.04] rounded-2xl border border-white/[0.06] p-4 text-center min-w-[140px]">
      <Icon className="h-5 w-5 mx-auto text-gray-400 mb-1.5" />
      <p className="font-semibold text-white text-sm">{label}</p>
      <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
    </div>
  );
}
