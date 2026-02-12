# Swiftbuy — Call Prep (LAUNCH)

**Format:** 10 min pitch/demo → Q&A
**Goal:** Get the $25K investment + LAUNCH support

---

## 🎯 The 10-Minute Script

You have 10 minutes. Split it: **4 min talking, 6 min live demo.** The demo IS the pitch. Don't waste time on slides — show the working product.

---

### MINUTE 0–1: The Hook (60 seconds)

> "Hey, I'm Nils. I've been in ecommerce for 7 years, done over $10 million in revenue. I know how people buy things online.
>
> When I started using OpenClaw, I loved it — smartest AI I've used. But after a few weeks I realized it can't actually DO anything. It can recommend the perfect headphones, but it can't buy them. It can plan my Amsterdam trip, but it can't book the flight. It's like having a genius assistant who's locked in a room.
>
> So I built Swiftbuy — the layer that gives OpenClaw the power to actually buy things on the web. Any product, any flight, any hotel. Using real money, from a real wallet, with the user in full control.
>
> Let me show you."

**Key:** Don't explain the architecture. Don't say "middleware" or "execution layer" yet. Just paint the picture and move to the demo.

---

### MINUTE 1–4: Live Demo — The "Wow" Moment (3 minutes)

**Open your terminal. Run the demo live.** This is what separates you from every other applicant sending slide decks.

#### Demo Flow:

**1. Show the Dashboard (30 sec)**
- Open `localhost:3001` in browser
- Quick flash of the dark-mode dashboard
- "This is what the user sees. Clean, simple — approve purchases, track orders, manage their agent."

**2. Show the Agent Connection (30 sec)**
- Show the skill.md on the dashboard
- "Any OpenClaw agent connects by loading this single file. Five minutes, done. The agent now has commerce superpowers."

**3. Live Search — Product (30 sec)**
- In terminal, fire the search API: headphones or something relatable
- "Watch — the agent searches across the entire web. Google Shopping, Amazon, multiple retailers. Natural language in, ranked results out."
- Show the results: titles, prices, retailers, ratings

**4. Live Search — Flight (30 sec)**
- Fire the flight search: "flight Bucharest to Amsterdam Feb 14"
- "Same API, same agent. It detects this is a flight query and routes to travel search. Products, flights, hotels, food — one unified API."

**5. Live Purchase — The Money Shot (60 sec)**
- Fire the purchase API with inline product data
- "Now the agent initiates the purchase. $79 flight — that's above the auto-approve threshold, so the user gets notified."
- Switch to dashboard → show the notification
- "User sees it on their dashboard: 'Your agent wants to book a flight for $79.99. Approve or reject.'"
- Click approve
- "Approved. The system off-ramps USDC from the Karma Wallet to fiat, executes the purchase, confirms the order. Done."
- Show the order status: pending → approved → processing → confirmed
- Show the status history with timestamps

**6. The Wallet (15 sec)**
- "The payment side is handled by my partner Amrish — he built Karma Agent Wallet. It gives the agent its own USDC wallet with automatic off-ramping. I bring the commerce brain, he brings the financial rail."

---

### MINUTE 4–5: Why This Matters (60 seconds)

> "So what you just saw is the full loop. User talks to their OpenClaw agent, agent searches, user approves, money moves, purchase confirmed. No browser tabs, no checkout forms, no comparison shopping.
>
> We're not building another chatbot. We're building the commerce infrastructure layer for the AI agent era. Every agent — OpenClaw, custom agents, enterprise bots — will need the ability to transact. We're that layer.
>
> The business model is simple: we take 1.5 to 2.5 percent of every transaction that flows through. Just like Stripe sits in the payment flow, we sit in the commerce flow. More agents connect, more transactions, more data, better recommendations — it's a flywheel.
>
> The product works. You just saw it. What we need is $25K to go live: deploy to production, onboard our first 100 users, and connect Karma Wallet for real transactions."

**Then stop talking. Let them ask questions.**

---

## 🔥 Anticipated Q&A — Have These Ready

### "How do you actually make money?"

> "Transaction fee — 1.5 to 2.5% on every purchase. The agent searches, the user buys, we take a small cut. Same model as Stripe but for AI-driven commerce. Long term, we add a premium tier for power users and B2B API access for companies building their own agents."

### "What's your unfair advantage? Why can't OpenClaw just build this?"

> "Three things. First, we're agent-agnostic — we're not tied to one platform. Any AI agent can plug in. OpenClaw won't build infrastructure for competitors. Second, the Karma Wallet integration — Amrish built the only agent-native USDC wallet with off-ramping. That's our payment moat. Third, my 7 years in ecommerce. I know checkout flows, I know conversion, I know fulfillment. This isn't a hackathon project — I've done $10M+ in online sales."

### "How does the wallet work? Isn't crypto complicated for users?"

> "The user loads USDC into their Karma Agent Wallet — that's a one-time setup. After that, it's invisible. When the agent makes a purchase, Karma automatically converts USDC to fiat and pays the merchant. The user just sees dollar amounts. They never think about crypto."

### "What about actual checkout? How do you buy on Amazon/Skyscanner?"

> "Right now we have the full pipeline working end-to-end with mock checkout. The search is real, the wallet debit is real, the order tracking is real. Actual retailer checkout is next — we're building headless browser automation with Playwright. For some categories like flights and hotels, we'll use affiliate links and booking APIs. The $25K helps us build this last mile."

**Be honest about this. Don't pretend automated checkout is done. Show that everything else IS done and this is the one remaining piece.**

### "What if retailers block you?"

> "Same challenge that every price comparison and cashback site has solved. We use a mix of strategies — API partnerships where available (like booking.com's affiliate API), headless browser automation with anti-detection for others, and for the initial phase, we generate affiliate links that complete the purchase on the retailer's site. The user clicks one link instead of doing 30 minutes of searching."

### "How big is this market?"

> "Global e-commerce is over $6 trillion. AI agent usage is exploding. If just 1% of online purchases flow through AI agents in the next few years — and I think that's conservative — that's $60 billion in GMV. At a 2% take rate, that's a $1.2 billion revenue opportunity. We don't need to capture the whole market. We just need to be the default commerce layer that agents plug into."

### "Who's your competition?"

> "There are a couple of early players — Purch.xyz and Molt Commerce. But they're focused on specific verticals or specific agent platforms. We're building the universal layer — any agent, any commerce type. Products, flights, hotels, food, tickets. And we have the wallet integration that nobody else has. Agents can't buy things without a payment method — Karma Wallet solves that."

### "What do you do with the $25K?"

> "Four things: deploy to production — hosting, API costs, security. Onboard first 100 OpenClaw users — real transactions, real feedback. Connect Karma Wallet for live payments. And build the checkout automation for the top 5 retailers. That gets us to revenue."

### "When do you get to revenue?"

> "As soon as we have live transactions. The product works — you saw the demo. We need deployment and the live wallet connection. I'd estimate 6–8 weeks to first revenue if we move fast."

### "Are you full-time on this?"

> **If yes:** "100%. This is what I'm doing."
> **If not yet:** "I'm transitioning. The product is built, and once we have funding to go live, I'm full-time."

### "What's your relationship with Amrish?"

> "We're building this together. I handle the platform — search, commerce logic, dashboard, agent integrations. He handles the financial infrastructure — the wallet, USDC management, off-ramping. We complement each other perfectly. He's crypto-native, I'm commerce-native."

### "What happens if OpenClaw adds native shopping?"

> "Great question. If OpenClaw adds shopping, they'll need an execution layer underneath — they won't build scrapers, checkout automation, and payment rails themselves. We'd be a natural integration partner. But more importantly, we're agent-agnostic. OpenClaw is one distribution channel. There will be hundreds of AI agents that need commerce capabilities. We're building for all of them."

---

## 🖥️ Demo Prep Checklist

Before the call:

- [ ] Backend running: `cd backend && npm run dev` (port 3000)
- [ ] Frontend running: `cd frontend && npx next dev -p 3001` (port 3001)
- [ ] MongoDB + Redis running
- [ ] Have terminal ready with pre-typed curl commands (so you're not typing live)
- [ ] Have the dashboard open in a browser tab at `localhost:3001`
- [ ] Test the full flow once before the call: search → purchase → approve → confirm
- [ ] Clean your terminal — no messy output from previous tests
- [ ] Have a registered user + agent already set up (don't waste demo time on registration)

### Pre-typed Demo Commands

Save these in a file and copy-paste during the demo:

```bash
# Search — Products
curl -s -X POST http://localhost:3000/api/v1/agent/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d "{\"user_id\":\"$USER_ID\",\"query\":\"Sony WH-1000XM5 headphones\",\"limit\":5}" | python3 -m json.tool

# Search — Flights
curl -s -X POST http://localhost:3000/api/v1/agent/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d "{\"user_id\":\"$USER_ID\",\"query\":\"flight Bucharest to Amsterdam February 14\",\"limit\":5}" | python3 -m json.tool

# Purchase — Flight
curl -s -X POST http://localhost:3000/api/v1/agent/purchase \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AGENT_TOKEN" \
  -d "{
    \"user_id\":\"$USER_ID\",
    \"product\": {
      \"title\": \"Flight Bucharest → Amsterdam — Wizz Air, Feb 14\",
      \"price\": 79.99,
      \"retailer\": \"Skyscanner\",
      \"url\": \"https://www.skyscanner.com/transport/flights/buh/ams/260214\",
      \"category\": \"flight\"
    },
    \"auto_approve\": false
  }" | python3 -m json.tool

# Check order status (replace ORDER_ID)
curl -s http://localhost:3000/api/v1/agent/orders/ORDER_ID_HERE \
  -H "Authorization: Bearer $AGENT_TOKEN" | python3 -m json.tool
```

---

## 💡 Tips for the Call

1. **Lead with the demo, not slides.** You have a working product. That's your superpower. 90% of applicants won't have this.

2. **Be honest about what's not built.** The checkout automation is a placeholder. Say it. They'll respect honesty over bullshit. Everything ELSE works.

3. **Show energy.** Jason and team invest in founders, not just products. Show them you're obsessed with this.

4. **Name-drop your ecommerce experience early.** "$10M+ in ecommerce" is credibility. It means you know this space, you're not guessing.

5. **Don't over-explain the tech.** They don't care about MongoDB vs Postgres. They care about: does it work, is there a market, can you execute.

6. **If you don't know an answer, say so.** "I don't have that number yet, but here's how I'd figure it out" is better than making something up.

7. **Have a question ready for them.** At the end, ask: *"What does the most successful company in your OpenClaw cohort look like to you? What would you need to see from us in 90 days?"* This shows you think in terms of milestones and execution.

---

## 📱 Screen Setup for the Call

Have these ready on your screen:

1. **Tab 1:** Swiftbuy Dashboard (localhost:3001) — logged in, dark mode
2. **Tab 2:** Terminal with pre-typed commands
3. **Tab 3:** This prep doc (for reference if needed)
4. **Tab 4:** Karma Agent Wallet site (https://agents.karmapay.xyz/) — in case they ask

Good luck, Nils. You've got a real product. Show them. 🚀

