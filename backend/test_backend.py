import sys
import os

# Include current directory in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import database, backtester

def main():
    print("Initializing SQLite Database...")
    database.init_db()
    
    print("\nRunning a sample backtest for RELIANCE.NS using SMA Strategy...")
    try:
        res = backtester.run_backtest_engine(
            ticker="RELIANCE.NS",
            strategy="sma",
            capital=100000.0,
            start_date="2024-01-01",
            end_date="2024-06-01"
        )
        print("\nBacktest Executed Successfully!")
        print(f"Metrics: {res['metrics']}")
        print(f"Total Trades Generated: {len(res['trades'])}")
        if len(res['trades']) > 0:
            print("First trade detail:")
            print(res['trades'][0])
        print(f"Chart Data Points: {len(res['chartData'])}")
    except Exception as e:
        print(f"\nBacktest failed: {e}")

if __name__ == "__main__":
    main()
