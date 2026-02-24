"""
ClawCart Checkout Agent — FastAPI Server

HTTP bridge so the Node.js backend can call the Python checkout agent.

Endpoints:
  POST /checkout          — Run a checkout (or dry-run)
  GET  /health            — Health check
  GET  /flows             — List all saved flows
  GET  /flows/{domain}    — Get saved flow for a domain
  DELETE /flows/{domain}  — Delete saved flow for a domain
  GET  /status            — List running/recent checkouts

Usage:
  uv run uvicorn server:app --host 0.0.0.0 --port 8100

From Node.js:
  const result = await fetch('http://localhost:8100/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_url: '...', shipping: {...}, card: {...} })
  });
"""

import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Dict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from checkout_agent import CheckoutRequest, CheckoutResult, run_checkout
import flow_store

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

logger = logging.getLogger('checkout_server')
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(name)s] %(levelname)s: %(message)s')

# Track running checkouts
running_checkouts: Dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events."""
    logger.info("🚀 ClawCart Checkout Agent server starting...")
    
    # Check API keys
    has_anthropic = bool(os.getenv('ANTHROPIC_API_KEY'))
    has_openai = bool(os.getenv('OPENAI_API_KEY'))
    has_browser_use = bool(os.getenv('BROWSER_USE_API_KEY'))
    
    if not any([has_anthropic, has_openai, has_browser_use]):
        logger.error("⛔ No LLM API key found! Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or BROWSER_USE_API_KEY")
    else:
        keys = []
        if has_anthropic: keys.append("Anthropic")
        if has_openai: keys.append("OpenAI")
        if has_browser_use: keys.append("BrowserUse")
        logger.info(f"✅ LLM keys found: {', '.join(keys)}")
    
    # Show saved flows
    flows = flow_store.list_flows()
    if flows:
        logger.info(f"📬 {len(flows)} saved flows loaded:")
        for f in flows:
            logger.info(f"   • {f['domain']} ({f['platform']}) — {f.get('nav_steps', 0)} nav, {f['form_fields']} form, {f['payment_fields']} payment, {f['success_count']} successes")
    else:
        logger.info("📭 No saved flows yet — will learn on first checkouts")
    
    yield
    
    logger.info("👋 Checkout Agent server shutting down")


app = FastAPI(
    title="ClawCart Checkout Agent",
    description="AI-powered checkout automation for any website",
    version="0.2.0",
    lifespan=lifespan,
)

# Allow Node.js backend to call us
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    """Health check endpoint."""
    flows = flow_store.list_flows()
    return {
        "status": "ok",
        "service": "clawcart-checkout-agent",
        "has_anthropic_key": bool(os.getenv('ANTHROPIC_API_KEY')),
        "has_openai_key": bool(os.getenv('OPENAI_API_KEY')),
        "has_browser_use_key": bool(os.getenv('BROWSER_USE_API_KEY')),
        "saved_flows": len(flows),
    }


@app.post("/checkout", response_model=CheckoutResult)
async def checkout(request: CheckoutRequest):
    """
    Run a checkout or dry-run checkout on any website.
    
    On repeat visits to the same domain, saved selectors are loaded
    automatically and used for faster form filling.
    
    This is a synchronous endpoint — it will block until the checkout 
    completes or times out. Typical execution time: 30-120 seconds.
    """
    checkout_id = str(uuid.uuid4())[:8]
    logger.info(f"[{checkout_id}] 📥 Checkout request: {request.product_url}")
    logger.info(f"[{checkout_id}]    dry_run={request.dry_run}, headless={request.headless}")
    
    running_checkouts[checkout_id] = {
        "status": "running",
        "url": request.product_url,
    }
    
    try:
        result = await run_checkout(request)
        running_checkouts[checkout_id]["status"] = "completed" if result.success else "failed"
        logger.info(f"[{checkout_id}] {'✅' if result.success else '❌'} Result: success={result.success}, {result.execution_ms}ms")
        
        if result.replay_steps_used > 0:
            logger.info(f"[{checkout_id}] ⏩ Replayed {result.replay_steps_used} navigation steps (0 LLM)")
        if result.learned_selectors:
            form_count = len(result.learned_selectors.get('form', {}))
            pay_count = len(result.learned_selectors.get('payment', {}))
            logger.info(f"[{checkout_id}] 🧠 Learned {form_count} form + {pay_count} payment selectors")
        if result.decision_needed:
            logger.info(f"[{checkout_id}] 🛑 Decision needed! {len(result.decision_points)} decision points:")
            for dp in result.decision_points:
                logger.info(f"[{checkout_id}]    • {dp.get('type', '?')}: {dp.get('message', '?')}")
        
        return result
    except Exception as e:
        running_checkouts[checkout_id]["status"] = "error"
        logger.error(f"[{checkout_id}] 💥 Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        asyncio.get_event_loop().call_later(300, lambda: running_checkouts.pop(checkout_id, None))


# ═══════════════════════════════════════════════════════════════════
# FLOW MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════

@app.get("/flows")
async def list_flows():
    """List all saved checkout flows with health status."""
    flows = flow_store.list_flows()
    
    # Enrich each flow with health status
    for f in flows:
        full_flow = flow_store.load_flow(f['domain'])
        if full_flow:
            health = flow_store.check_flow_health(full_flow)
            f['health'] = health['status']
            f['success_rate'] = health['success_rate']
            f['failure_count'] = health['failure_count']
            f['consecutive_failures'] = health['consecutive_failures']
            f['needs_relearn'] = health['needs_relearn']
    
    return {"flows": flows, "count": len(flows)}


@app.get("/flows/{domain}")
async def get_flow(domain: str):
    """Get a saved checkout flow for a specific domain."""
    flow = flow_store.load_flow(domain)
    if not flow:
        raise HTTPException(status_code=404, detail=f"No saved flow for domain '{domain}'")
    return flow


@app.delete("/flows/{domain}")
async def delete_flow(domain: str):
    """Delete a saved checkout flow for a domain."""
    deleted = flow_store.delete_flow(domain)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No saved flow for domain '{domain}'")
    return {"deleted": True, "domain": domain}


@app.get("/status")
async def status():
    """List running/recent checkouts."""
    return {"checkouts": running_checkouts}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
