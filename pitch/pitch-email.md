# Swiftbuy — Pitch to Launch.co

**To:** openclaw@launch.co
**From:** Nils De Rijke
**Subject:** Swiftbuy — We gave OpenClaw a wallet and taught it to buy anything on the web

---

Hey Jason & team,

I'm Nils De Rijke. I've spent the last 7 years in e-commerce and generated over $10M+ in revenue. I know how people buy things online — and I know how painful it still is.

When I started using OpenClaw, I loved it. Smart, fast, great conversations. But after a few weeks I realized — it can't actually *do* anything. It can tell me the best noise-cancelling headphones, but it can't buy them. It can plan my trip to Amsterdam, but it can't book the flight. It felt like having a brilliant assistant who isn't allowed to leave the office.

So I built **Swiftbuy** — the execution layer that gives OpenClaw the ability to actually purchase things on behalf of the user.

## What it does

Swiftbuy is middleware between OpenClaw (or any AI agent) and the entire internet of commerce. The agent connects via a simple skill file, and suddenly it can:

- **Search** across the entire web — products, flights, hotels, food delivery, event tickets, car rentals
- **Compare** prices and options, personalized to the user's preferences, sizes, and past behavior
- **Purchase** — with built-in approval workflows, spending limits, and order tracking

The user stays in their OpenClaw conversation the whole time. They say *"book me a flight to Amsterdam on Feb 14"* and the agent handles the rest — search, compare, present options, and execute the purchase once approved.

## The wallet piece

My partner **Amrish** ([𝕏](https://x.com/amrix_j)) built **Karma Agent Wallet** — a USDC wallet designed specifically for AI agents. It gives every agent its own wallet with automatic off-ramping from USDC to fiat.

This is the missing piece. AI agents couldn't transact because they had no money. Karma Wallet gives them a payment rail. Swiftbuy gives them a commerce brain. Together: an agent that can actually buy things in the real world.

The user loads USDC into their agent's wallet → the agent finds what they need → Swiftbuy executes the purchase → Karma Wallet off-ramps to fiat and pays the merchant. End to end.

## What's built (it's real)

This is not a pitch deck with mockups. We have a working product:

- ✅ **Universal search engine** — searches Google Shopping, flights, hotels, Amazon, and more via a smart query processor that extracts intent from natural language ("find me a cheap direct flight to Tokyo next Friday")
- ✅ **Purchase execution pipeline** — full order lifecycle from creation → approval → wallet debit → checkout → confirmation → tracking
- ✅ **Agent API with skill file** — any OpenClaw agent can connect in under 5 minutes by loading a single `skill.md` file
- ✅ **User dashboard** — approve/reject purchases, track orders, manage spending limits, view transaction history, connect wallet
- ✅ **Approval workflows** — auto-approve small purchases, require manual approval above user-set thresholds
- ✅ **In-app notifications** — users get notified at every step of the purchase
- ✅ **Commerce intelligence** — the platform learns user preferences (sizes, brands, dietary restrictions) and personalizes results
- ✅ **Karma Wallet integration** — USDC balance checks, off-ramp transactions, fee tracking

The backend is Node.js + Express + MongoDB + Redis. The frontend is Next.js + Tailwind. The product works locally end-to-end. Deployment is next.

## Why this is a business

Every time an AI agent buys something through Swiftbuy, we're in the transaction flow. Our revenue model:

- **Transaction fee (1.5–2.5%)** on every purchase executed through the platform — just like Stripe sits in the payment flow, we sit in the commerce flow
- **Premium tier** for power users — higher spending limits, priority search, multi-agent support
- **Agent builder partnerships** — API access for companies building their own AI agents who need commerce capabilities (B2B2C)

The more agents connect, the more transactions flow through. The more transactions, the more data. The more data, the better the recommendations, the more users trust their agent to buy for them. It's a flywheel.

## Market timing

AI agents are exploding, but none of them can transact. Every agent platform — OpenClaw, custom GPTs, Claude artifacts — is a chatbot until it can actually *do things* in the real world. Commerce is the most obvious, highest-value action an agent can take.

Global e-commerce is $6T+. If even 1% of online purchases flow through AI agents in the next 3–5 years, that's $60B+ in GMV. At a 2% take rate, that's a $1.2B revenue opportunity. And we think 1% is conservative — this is how the next generation will shop.

Stablecoin infrastructure (USDC, off-ramp rails) is finally mature enough to make agent-to-merchant payments viable. Karma Wallet proves it. The timing is now.

## The team

**Nils De Rijke** — 7 years in e-commerce, $10M+ in revenue. I know how commerce works at every level — product sourcing, checkout optimization, conversion, fulfillment. I built Swiftbuy because I've lived the pain of online shopping and I know exactly what an AI agent needs to replace it.

**Amrish** ([𝕏](https://x.com/amrix_j)) — Built Karma Agent Wallet. Crypto-native, deep in stablecoin infrastructure and agent-to-agent payment rails. He built the financial layer that makes autonomous agent commerce possible.

We complement each other: I bring the commerce brain, he brings the financial infrastructure.

## The ask

We're applying for the $25K Launch investment to:

1. **Deploy to production** — the product works, we need infrastructure (hosting, API costs for search providers, security audit)
2. **Onboard first 100 OpenClaw users** — real users, real transactions, real feedback
3. **Integrate Karma Wallet for live transactions** — connect the off-ramp pipeline so agents can make real purchases
4. **Build the checkout automation** — headless browser checkout on major retailers (the last manual piece)

We're not raising a big round yet. We want to prove this with real users first. $25K gets us to live transactions and our first revenue.

## One more thing

I didn't build Swiftbuy to be a demo. I built it because I genuinely believe the future of shopping is conversational. Nobody wants to open 14 browser tabs to compare flights. Nobody wants to scroll through 200 Amazon listings for a phone case. You just want to tell your AI agent what you need and have it show up at your door.

That future needs an execution layer. That's Swiftbuy.

Happy to demo the working product anytime.

— Nils

**Links:**
- Swiftbuy platform: [in development — happy to share localhost demo]
- Karma Agent Wallet: [https://agents.karmapay.xyz/](https://agents.karmapay.xyz/)
- Amrish: [https://x.com/amrix_j](https://x.com/amrix_j)



