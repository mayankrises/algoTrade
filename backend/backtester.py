import pandas as pd
import yfinance as yf
import pandas_datareader as pdr
from datetime import datetime
from backend.strategies import sma, rsi, sr_bounce
from backend import database

BUILTIN_STRATEGIES = {"sma", "rsi", "sr_bounce", "support_resistance_bounce"}

def map_timeframe_to_pdr_interval(timeframe: str) -> str:
    tf = timeframe.lower()
    if 'w' in tf:
        return 'w'
    elif 'mo' in tf:
        return 'm'
    else:
        return 'd'

def download_data(ticker: str, start_date: str, end_date: str, timeframe: str = "1d"):
    try:
        print(f"[backtester] Downloading {ticker} from {start_date} to {end_date} interval={timeframe} via yfinance...")
        df = yf.download(ticker, start=start_date, end=end_date, interval=timeframe)
        if df.empty or len(df) < 5:
            raise ValueError(f"Insufficient data for '{ticker}' between {start_date} and {end_date}.")
        return df
    except Exception as e:
        print(f"[backtester] yfinance failed: {e}. Trying pandas_datareader...")
        try:
            pdr_interval = map_timeframe_to_pdr_interval(timeframe)
            df = pdr.get_data_yahoo(ticker, start=start_date, end=end_date, interval=pdr_interval)
            if df.empty or len(df) < 5:
                raise ValueError(f"Insufficient data for '{ticker}' between {start_date} and {end_date}.")
            return df
        except Exception as pdr_err:
            raise ValueError(
                f"Unable to download data for {ticker} using both yfinance and pandas_datareader. "
                f"Check dates or internet connection. Details: {pdr_err}"
            )

def run_custom_strategy(code: str, df: pd.DataFrame, capital: float, ticker: str) -> dict:
    """
    Executes a user-supplied strategy in an isolated namespace.
    The code must define run_backtest(df, capital, ticker_name) -> dict.
    """
    namespace = {
        "pd": pd,
        "np": __import__("numpy"),
    }
    try:
        exec(compile(code, "<custom_strategy>", "exec"), namespace)
    except SyntaxError as e:
        raise ValueError(f"Syntax error in custom strategy code: {e}")

    run_fn = namespace.get("run_backtest")
    if run_fn is None:
        raise ValueError(
            "Custom strategy must define a 'run_backtest(df, capital, ticker_name)' function."
        )

    try:
        result = run_fn(df, capital, ticker)
    except Exception as e:
        raise ValueError(f"Error while running custom strategy: {e}")

    # Validate result shape
    if not isinstance(result, dict) or "metrics" not in result or "trades" not in result or "chartData" not in result:
        raise ValueError(
            "Custom strategy's run_backtest must return a dict with keys: 'metrics', 'trades', 'chartData'."
        )
    return result

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

    # Standardize multi-index columns from yfinance
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    strategy_key = strategy.lower().strip()

    # ── Built-in strategies ───────────────────────────────────────────────────
    if strategy_key == "sma":
        return sma.run_backtest(df, capital, ticker)
    elif strategy_key == "rsi":
        return rsi.run_backtest(df, capital, ticker)
    elif strategy_key in ("sr_bounce", "support_resistance_bounce"):
        return sr_bounce.run_backtest(df, capital, ticker)

    # ── Custom strategies (from database) ────────────────────────────────────
    record = database.get_custom_strategy_by_name(strategy_key)
    if record:
        return run_custom_strategy(record["code"], df, capital, ticker)

    raise ValueError(
        f"Unknown strategy '{strategy}'. "
        f"Built-in options: sma, rsi, sr_bounce. "
        f"You can also upload a custom strategy on the Strategies page."
    )
