import sys
if sys.platform == "darwin":
    import selectors
    selectors.DefaultSelector = selectors.SelectSelector

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import re
from backend import database, backtester
from backend.paper_trader import paper_trader_bot

app = FastAPI(title="Algo Trading Paper Trading API")

# Configure CORS for Next.js frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Database Initializer
@app.on_event("startup")
def startup_event():
    database.init_db()
    # Mark any running bots from previous session as stopped on reboot
    states = database.get_all_paper_states()
    for state in states:
        if state["is_running"] == 1:
            database.update_paper_state(ticker=state["ticker"], strategy=state["strategy"], is_running=0)

# Request Models
class BacktestRequest(BaseModel):
    ticker: str = "RELIANCE.NS"
    strategy: str = "sma"
    capital: float = 100000.0
    start: str = "2024-01-01"
    end: str = "2025-01-01"
    timeframe: str = "1d"

class PaperStartRequest(BaseModel):
    ticker: str = "RELIANCE.NS"
    strategy: str = "sma"
    capital: float = 100000.0

class PaperStopRequest(BaseModel):
    ticker: str
    strategy: str

class CustomStrategyRequest(BaseModel):
    name: str          # identifier slug, e.g. "macd_cross"
    display_name: str  # human-readable, e.g. "MACD Crossover"
    description: Optional[str] = ""
    code: str          # full Python source code

@app.get("/health")
def health_check():
    return {"status": "ok", "db_connected": True}

@app.post("/backtest")
def run_backtest(req: BacktestRequest):
    try:
        results = backtester.run_backtest_engine(
            ticker=req.ticker,
            strategy=req.strategy,
            capital=req.capital,
            start_date=req.start,
            end_date=req.end,
            timeframe=req.timeframe
        )
        return results
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtester error: {e}")

@app.get("/strategies")
def get_strategies():
    builtin = [
        {
            "id": "sma",
            "name": "SMA Crossover",
            "description": "Uses 20 SMA and 50 SMA lines to catch market crossovers.",
            "entry_rule": "Buy when the 20 SMA crosses above the 50 SMA.",
            "exit_rule": "Sell when the 20 SMA crosses below the 50 SMA.",
            "risk_rule": "Uses maximum available virtual cash for ordering.",
            "is_custom": False
        },
        {
            "id": "rsi",
            "name": "RSI Strategy",
            "description": "Uses Relative Strength Index (RSI) bounds to identify extreme market prices.",
            "entry_rule": "Buy when RSI crosses below the 30 oversold limit.",
            "exit_rule": "Sell when RSI crosses above the 70 overbought limit.",
            "risk_rule": "Uses maximum available virtual cash for ordering.",
            "is_custom": False
        },
        {
            "id": "sr_bounce",
            "name": "Support/Resistance Bounce",
            "description": "Detects local support and resistance lines based on 20-period price bounds.",
            "entry_rule": "Buy when price dips below support and closes back above it.",
            "exit_rule": "Sell when price touches resistance and closes back below it.",
            "risk_rule": "Uses maximum available virtual cash for ordering.",
            "is_custom": False
        }
    ]
    try:
        custom = database.get_all_custom_strategies()
        for c in custom:
            builtin.append({
                "id": c["name"],
                "name": c["display_name"],
                "description": c.get("description", ""),
                "entry_rule": "Defined in custom code.",
                "exit_rule": "Defined in custom code.",
                "risk_rule": "Defined in custom code.",
                "is_custom": True,
                "created_at": c.get("created_at", "")
            })
    except Exception as e:
        print(f"Warning: could not load custom strategies: {e}")
    return builtin

# ── Custom Strategy Endpoints ────────────────────────────────────────────────

@app.post("/strategies/custom")
def create_custom_strategy(req: CustomStrategyRequest):
    # Validate slug format
    if not re.match(r'^[a-z0-9_]+$', req.name):
        raise HTTPException(
            status_code=400,
            detail="Strategy name must be lowercase alphanumeric with underscores only (e.g. 'macd_cross')."
        )
    # Validate code has required functions
    if "def run_backtest" not in req.code:
        raise HTTPException(
            status_code=400,
            detail="Strategy code must define a 'run_backtest(df, capital, ticker_name)' function."
        )
    try:
        # Check if already exists — if so, update it
        existing = database.get_custom_strategy_by_name(req.name)
        if existing:
            database.update_custom_strategy(req.name, req.display_name, req.description or "", req.code)
            return {"status": "updated", "name": req.name}
        else:
            database.save_custom_strategy(req.name, req.display_name, req.description or "", req.code)
            return {"status": "created", "name": req.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save strategy: {e}")

@app.get("/strategies/custom")
def list_custom_strategies():
    try:
        return database.get_all_custom_strategies()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/strategies/custom/{name}")
def get_custom_strategy(name: str):
    record = database.get_custom_strategy_by_name(name)
    if not record:
        raise HTTPException(status_code=404, detail=f"Custom strategy '{name}' not found.")
    return record

@app.delete("/strategies/custom/{name}")
def delete_custom_strategy(name: str):
    record = database.get_custom_strategy_by_name(name)
    if not record:
        raise HTTPException(status_code=404, detail=f"Custom strategy '{name}' not found.")
    database.delete_custom_strategy(name)
    return {"status": "deleted", "name": name}

@app.get("/trades")
def get_trades():
    try:
        trades = database.get_all_trades()
        return trades
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/paper/start")
def start_paper_trading(req: PaperStartRequest):
    try:
        paper_trader_bot.start_bot(
            ticker=req.ticker,
            strategy=req.strategy,
            capital=req.capital
        )
        return {"status": "started", "ticker": req.ticker, "strategy": req.strategy}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start paper bot: {e}")

@app.post("/paper/stop")
def stop_paper_trading(req: PaperStopRequest):
    try:
        paper_trader_bot.stop_bot(req.ticker, req.strategy)
        return {"status": "stopped", "ticker": req.ticker, "strategy": req.strategy}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop paper bot: {e}")

@app.get("/paper/status")
def get_paper_status():
    try:
        status = paper_trader_bot.get_all_statuses()
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch status: {e}")

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)
