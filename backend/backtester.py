import pandas as pd
import yfinance as yf
import pandas_datareader as pdr
from datetime import datetime
from backend.strategies import sma, rsi, sr_bounce

def map_timeframe_to_pdr_interval(timeframe: str) -> str:
    # yfinance uses '1d', '5d', '1wk', '1mo', '3mo', etc.
    # pandas_datareader YahooDailyReader uses 'd', 'w', 'm'
    tf = timeframe.lower()
    if 'w' in tf:
        return 'w'
    elif 'mo' in tf:
        return 'm'
    else:
        return 'd' # Fallback to daily

def download_data(ticker: str, start_date: str, end_date: str, timeframe: str = "1d"):
    # Try downloading with yfinance first
    try:
        print(f"Downloading historical data for {ticker} from {start_date} to {end_date} with interval '{timeframe}' using yfinance...")
        df = yf.download(ticker, start=start_date, end=end_date, interval=timeframe)
        
        if df.empty or len(df) < 5:
            raise ValueError(f"No sufficient data found for ticker '{ticker}' between {start_date} and {end_date}.")
        
        return df
    except Exception as e:
        print(f"Failed to download data using yfinance. Trying pandas_datareader: {e}")
        try:
            pdr_interval = map_timeframe_to_pdr_interval(timeframe)
            print(f"Downloading historical data for {ticker} from {start_date} to {end_date} with interval '{pdr_interval}' using pandas_datareader...")
            
            df = pdr.get_data_yahoo(ticker, start=start_date, end=end_date, interval=pdr_interval)
            
            if df.empty or len(df) < 5:
                raise ValueError(f"No sufficient data found for ticker '{ticker}' between {start_date} and {end_date}.")
            
            return df
        except Exception as pdr_err:
            print(f"Failed to download data using pandas_datareader: {pdr_err}")
            raise ValueError(f"Unable to download historical data for {ticker} from {start_date} to {end_date} using both yfinance and pandas_datareader. Please try again with different dates or check your connection.")

def run_backtest_engine(ticker: str, strategy: str, capital: float, start_date: str, end_date: str, timeframe: str = "1d"):
    # Validate dates
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError:
        raise ValueError("Invalid date format. Must be YYYY-MM-DD.")
        
    if start_date >= end_date:
        raise ValueError("Start date must be before end date.")
        
    # Download historical data
    df = download_data(ticker, start_date=start_date, end_date=end_date, timeframe=timeframe)
    
    # Standardize column structure if yfinance/pdr returns multi-index columns
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

