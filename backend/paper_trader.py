import threading
import time
import random
import json
from datetime import datetime, timedelta
import pandas as pd
import yfinance as yf
from backend import database
from backend.strategies import sma, rsi, sr_bounce

class PaperTradingBotInstance:
    def __init__(self, ticker: str, strategy_name: str, capital: float):
        self.ticker = ticker
        self.strategy_name = strategy_name
        self.capital = capital
        self.current_price = 0.0
        self.bars = []  # list of dicts: {'time', 'open', 'high', 'low', 'close', 'volume'}
        self.last_signal = "HOLD"
        self.active_position = None
        self.lock = threading.Lock()

    def initialize_data(self):
        print(f"Initializing paper trader for {self.ticker} using {self.strategy_name} strategy with {self.capital} capital...")
        
        # Download 1-minute historical data for initialization
        try:
            df = yf.download(self.ticker, period="1d", interval="1m")
            if not df.empty and len(df) >= 2:
                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)
                    
                for idx, row in df.iterrows():
                    time_str = idx.strftime('%Y-%m-%d %H:%M:%S')
                    self.bars.append({
                        "time": time_str,
                        "open": float(row["Open"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "close": float(row["Close"]),
                        "volume": int(row["Volume"]) if "Volume" in row else 100
                    })
                self.current_price = self.bars[-1]["close"]
        except Exception as e:
            print(f"yfinance initialization failed for {self.ticker}, using mock data starter: {e}")
            
        if not self.bars:
            # Fallback to mock history if yfinance fails
            now = datetime.now()
            base_price = 2500.0
            if "INFY" in self.ticker:
                base_price = 1500.0
            elif "TCS" in self.ticker:
                base_price = 3800.0
            elif "AAPL" in self.ticker:
                base_price = 180.0
            elif "GOOG" in self.ticker:
                base_price = 170.0
                
            self.current_price = base_price
            for i in range(50):
                t = now - timedelta(minutes=(50 - i))
                self.bars.append({
                    "time": t.strftime('%Y-%m-%d %H:%M:%S'),
                    "open": base_price,
                    "high": base_price,
                    "low": base_price,
                    "close": base_price,
                    "volume": 100
                })
                
        # Load active position if it was saved in SQLite
        db_state = database.get_paper_state(self.ticker, self.strategy_name)
        if db_state:
            self.active_position = db_state["current_position"]
            self.capital = db_state["capital"]
            
        # Update SQLite database to set running status
        database.update_paper_state(
            ticker=self.ticker,
            strategy=self.strategy_name,
            is_running=1,
            capital=self.capital,
            current_position=self.active_position,
            last_signal=self.last_signal
        )

    def process_tick(self):
        with self.lock:
            # 1. Simulate new price tick (random walk)
            change = random.uniform(-0.0006, 0.0006)
            new_price = self.current_price * (1 + change)
            
            # Group into 1-minute bars
            now = datetime.now()
            minute_time = now.replace(second=0, microsecond=0)
            minute_str = minute_time.strftime('%Y-%m-%d %H:%M:%S')
            
            if not self.bars:
                self.bars.append({
                    "time": minute_str,
                    "open": new_price,
                    "high": new_price,
                    "low": new_price,
                    "close": new_price,
                    "volume": 100
                })
            else:
                last_bar = self.bars[-1]
                last_bar_time = datetime.strptime(last_bar["time"], '%Y-%m-%d %H:%M:%S')
                
                if minute_time > last_bar_time:
                    # Create a new bar
                    self.bars.append({
                        "time": minute_str,
                        "open": last_bar["close"],
                        "high": max(last_bar["close"], new_price),
                        "low": min(last_bar["close"], new_price),
                        "close": new_price,
                        "volume": 100
                    })
                else:
                    # Update existing bar
                    last_bar["high"] = max(last_bar["high"], new_price)
                    last_bar["low"] = min(last_bar["low"], new_price)
                    last_bar["close"] = new_price
                    last_bar["volume"] += 10
                    
            self.current_price = new_price
            
            # Keep history in check
            if len(self.bars) > 100:
                self.bars.pop(0)
                
            # 2. Convert to DataFrame to feed strategy engine
            df_cols = ["time", "open", "high", "low", "close", "volume"]
            records = []
            for b in self.bars:
                records.append([b["time"], b["open"], b["high"], b["low"], b["close"], b["volume"]])
                
            df = pd.DataFrame(records, columns=df_cols)
            df.set_index(pd.to_datetime(df["time"]), inplace=True)
            df.rename(columns={
                "open": "Open",
                "high": "High",
                "low": "Low",
                "close": "Close",
                "volume": "Volume"
            }, inplace=True)
            
            # 3. Calculate signals
            signal = 0
            df_signals = None
            
            if self.strategy_name == "sma":
                df_signals = sma.generate_signals(df)
            elif self.strategy_name == "rsi":
                df_signals = rsi.generate_signals(df)
            elif self.strategy_name == "sr_bounce":
                df_signals = sr_bounce.generate_signals(df)
                
            if df_signals is not None and len(df_signals) > 0:
                signal = int(df_signals["signal"].iloc[-1])
                
            # Set visual indicators
            if signal == 1:
                self.last_signal = "BUY"
            elif signal == -1:
                self.last_signal = "SELL"
            else:
                self.last_signal = "HOLD"
                
            # 4. Handle Position Transactions
            now_str = now.strftime('%Y-%m-%d %H:%M:%S')
            
            if signal == 1 and not self.active_position:
                # BUY: enter position using all capital
                qty = int(self.capital // new_price)
                if qty > 0:
                    cost = qty * new_price
                    self.capital -= cost
                    self.active_position = {
                        "entry_price": new_price,
                        "quantity": qty,
                        "entry_time": now_str
                    }
                    print(f"[{self.ticker}-{self.strategy_name}] SIMULATED BUY: {qty} shares at {new_price:.2f}")
                    
            elif signal == -1 and self.active_position:
                # SELL: close position
                qty = self.active_position["quantity"]
                entry_price = self.active_position["entry_price"]
                revenue = qty * new_price
                self.capital += revenue
                pnl = revenue - (qty * entry_price)
                return_pct = (new_price - entry_price) / entry_price * 100
                
                trade = {
                    "ticker": self.ticker,
                    "strategy": self.strategy_name.upper() + " Crossover" if self.strategy_name == "sma" else self.strategy_name.upper() + " Strategy",
                    "mode": "paper",
                    "entry_time": self.active_position["entry_time"],
                    "entry_price": entry_price,
                    "exit_time": now_str,
                    "exit_price": new_price,
                    "quantity": qty,
                    "pnl": pnl,
                    "return_pct": return_pct,
                    "exit_reason": f"{self.strategy_name.upper()} Paper Exit"
                }
                database.save_trade(trade)
                print(f"[{self.ticker}-{self.strategy_name}] SIMULATED SELL: {qty} shares at {new_price:.2f}, P&L: {pnl:.2f}")
                self.active_position = None
                
            # 5. Persist Current State to DB
            database.update_paper_state(
                ticker=self.ticker,
                strategy=self.strategy_name,
                is_running=1,
                capital=self.capital,
                current_position=self.active_position,
                last_signal=self.last_signal
            )

    def stop(self, reason: str = "Bot Stopped"):
        with self.lock:
            # If there's an active position, force close it and log the trade
            if self.active_position:
                now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                qty = self.active_position["quantity"]
                entry_price = self.active_position["entry_price"]
                exit_price = self.current_price
                
                revenue = qty * exit_price
                self.capital += revenue
                pnl = revenue - (qty * entry_price)
                return_pct = (exit_price - entry_price) / entry_price * 100 if entry_price > 0 else 0.0
                
                trade = {
                    "ticker": self.ticker,
                    "strategy": self.strategy_name.upper() + " Crossover" if self.strategy_name == "sma" else self.strategy_name.upper() + " Strategy",
                    "mode": "paper",
                    "entry_time": self.active_position["entry_time"],
                    "entry_price": entry_price,
                    "exit_time": now_str,
                    "exit_price": exit_price,
                    "quantity": qty,
                    "pnl": pnl,
                    "return_pct": return_pct,
                    "exit_reason": reason
                }
                database.save_trade(trade)
                self.active_position = None
                
            database.update_paper_state(
                ticker=self.ticker,
                strategy=self.strategy_name,
                is_running=0,
                capital=self.capital,
                current_position=None,
                last_signal="HOLD"
            )

    def get_status(self):
        with self.lock:
            current_pos = None
            if self.active_position:
                entry_price = self.active_position["entry_price"]
                qty = self.active_position["quantity"]
                unrealized_pnl = qty * (self.current_price - entry_price)
                unrealized_pct = ((self.current_price - entry_price) / entry_price * 100) if entry_price > 0 else 0.0
                
                current_pos = {
                    **self.active_position,
                    "current_price": self.current_price,
                    "pnl": unrealized_pnl,
                    "return_pct": unrealized_pct
                }
                
            return {
                "is_running": True,
                "ticker": self.ticker,
                "strategy": self.strategy_name,
                "capital": self.capital,
                "current_price": self.current_price,
                "current_position": current_pos,
                "last_signal": self.last_signal,
                "chart_data": self.bars[-50:] if len(self.bars) >= 50 else self.bars
            }

class PaperTradingManager:
    def __init__(self):
        self.active_bots = {}  # dict mapping (ticker, strategy) -> PaperTradingBotInstance
        self.lock = threading.Lock()
        self.stop_event = threading.Event()
        
        # Start persistent scheduler loop thread
        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()

    def start_bot(self, ticker: str, strategy: str, capital: float):
        key = (ticker.upper().strip(), strategy.lower().strip())
        with self.lock:
            if key in self.active_bots:
                print(f"Bot {key[0]} ({key[1]}) is already running.")
                return
                
            bot = PaperTradingBotInstance(key[0], key[1], capital)
            bot.initialize_data()
            self.active_bots[key] = bot
            print(f"Started bot {key[0]} ({key[1]}) successfully.")

    def stop_bot(self, ticker: str, strategy: str):
        key = (ticker.upper().strip(), strategy.lower().strip())
        with self.lock:
            if key not in self.active_bots:
                print(f"Bot {key[0]} ({key[1]}) is not running.")
                return
                
            bot = self.active_bots[key]
            bot.stop("Bot Stopped (Force Close)")
            del self.active_bots[key]
            print(f"Stopped bot {key[0]} ({key[1]}) successfully.")

    def get_all_statuses(self):
        # 1. Fetch running status of active bots in memory
        statuses = []
        with self.lock:
            for bot in self.active_bots.values():
                statuses.append(bot.get_status())
                
        # 2. Also retrieve saved offline records from SQLite so the UI knows they exist
        db_states = database.get_all_paper_states()
        running_keys = { (s["ticker"], s["strategy"]) for s in statuses }
        
        for state in db_states:
            key = (state["ticker"], state["strategy"])
            if key not in running_keys:
                statuses.append({
                    "is_running": False,
                    "ticker": state["ticker"],
                    "strategy": state["strategy"],
                    "capital": state["capital"],
                    "current_price": 0.0,
                    "current_position": None,
                    "last_signal": "HOLD",
                    "chart_data": []
                })
                
        return statuses

    def _run_loop(self):
        while not self.stop_event.is_set():
            time.sleep(5)
            
            with self.lock:
                bots = list(self.active_bots.values())
                
            for bot in bots:
                try:
                    bot.process_tick()
                except Exception as e:
                    print(f"Error ticking bot {bot.ticker} ({bot.strategy_name}): {e}")

# Singleton Instance
paper_trader_bot = PaperTradingManager()
