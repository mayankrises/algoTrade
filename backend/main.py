import sys
if sys.platform == "darwin":
    import selectors
    selectors.DefaultSelector = selectors.SelectSelector

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
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
    return [
        {
            "id": "sma",
            "name": "SMA Crossover",
            "description": "Uses 20 Simple Moving Average (SMA) and 50 Simple Moving Average (SMA) technical lines to catch market crossovers.",
            "entry_rule": "Buy when the 20 SMA crosses above the 50 SMA.",
            "exit_rule": "Sell when the 20 SMA crosses below the 50 SMA.",
            "risk_rule": "Uses maximum available virtual cash for ordering."
        },
        {
            "id": "rsi",
            "name": "RSI Strategy",
            "description": "Uses Relative Strength Index (RSI) bounds to identify extreme market prices.",
            "entry_rule": "Buy when RSI crosses below the 30 oversold limit.",
            "exit_rule": "Sell when RSI crosses above the 70 overbought limit.",
            "risk_rule": "Uses maximum available virtual cash for ordering."
        },
        {
            "id": "sr_bounce",
            "name": "Support/Resistance Bounce",
            "description": "Detects local support and resistance lines based on 20-period price bounds, taking bounce reversals.",
            "entry_rule": "Buy when price dips below support and closes back above it.",
            "exit_rule": "Sell when price touches resistance and closes back below it.",
            "risk_rule": "Uses maximum available virtual cash for ordering."
        }
    ]

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
