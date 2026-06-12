import pandas as pd
import yfinance as yf
from datetime import datetime
from backend.strategies import sma, rsi, sr_bounce

def run_backtest_engine(ticker: str, strategy: str, capital: float, start_date: str, end_date: str, timeframe: str = "1d"):
    # Validate dates
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Invalid date format. Must be YYYY-MM-DD.")
        
    if start_date >= end_date:
        raise ValueError("Start date must be before end date.")
        
    # Download historical data from yfinance
    print(f"Downloading historical data for {ticker} from {start_date} to {end_date} with interval '{timeframe}'...")
    df = yf.download(ticker, start=start_date, end=end_date, interval=timeframe)
    
    if df.empty or len(df) < 5:
        raise ValueError(f"No sufficient data found for ticker '{ticker}' between {start_date} and {end_date}.")
        
    # Standardize column structure if yfinance returns multi-index columns (happens sometimes in newer versions)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
        
    strategy = strategy.lower().strip()
    
    if strategy == "sma":
        return sma.run_backtest(df, capital, ticker)
    elif strategy == "rsi":
        return rsi.run_backtest(df, capital, ticker)
    elif strategy == "sr_bounce" or strategy == "support_resistance_bounce":
        return sr_bounce.run_backtest(df, capital, ticker)
    else:
        raise ValueError(f"Unsupported strategy '{strategy}'. Choose 'sma', 'rsi', or 'sr_bounce'.")
