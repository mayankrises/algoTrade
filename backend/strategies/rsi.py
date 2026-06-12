import pandas as pd
import numpy as np

def generate_signals(df: pd.DataFrame):
    close_col = 'Close'
    if 'Close' not in df.columns:
        cols = {c.lower(): c for c in df.columns}
        if 'close' in cols:
            close_col = cols['close']
        else:
            raise ValueError("DataFrame must contain a 'Close' column.")
            
    df = df.copy()
    
    # Calculate RSI
    delta = df[close_col].diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    
    # Use exponential moving average for RSI calculation (standard Wilder's RSI)
    avg_gain = gain.ewm(com=13, adjust=False).mean()
    avg_loss = loss.ewm(com=13, adjust=False).mean()
    
    rs = avg_gain / avg_loss
    df['rsi'] = 100 - (100 / (1 + rs))
    
    df['signal'] = 0
    
    # Generate signals
    # Buy when RSI drops below 30 and crosses back above or simply is below 30 (oversold)
    # We will trigger BUY when RSI crosses below 30 (or exits oversold)
    # Let's say: buy when RSI crosses below 30, sell when RSI crosses above 70.
    for i in range(1, len(df)):
        prev_rsi = df['rsi'].iloc[i-1]
        curr_rsi = df['rsi'].iloc[i]
        
        if pd.isna(prev_rsi) or pd.isna(curr_rsi):
            continue
            
        # Cross below 30: Buy
        if prev_rsi >= 30 and curr_rsi < 30:
            df.loc[df.index[i], 'signal'] = 1
        # Cross above 70: Sell
        elif prev_rsi <= 70 and curr_rsi > 70:
            df.loc[df.index[i], 'signal'] = -1
            
    return df

def run_backtest(df: pd.DataFrame, capital: float, ticker_name: str = "RELIANCE.NS"):
    df_signals = generate_signals(df)
    
    current_capital = capital
    cash = capital
    position = None
    trades = []
    
    close_col = 'Close'
    if 'Close' not in df_signals.columns:
        cols = {c.lower(): c for c in df_signals.columns}
        close_col = cols.get('close', df_signals.columns[0])
        
    for idx, row in df_signals.iterrows():
        price = float(row[close_col])
        signal = int(row['signal'])
        time_str = idx.strftime('%Y-%m-%d %H:%M:%S') if hasattr(idx, 'strftime') else str(idx)
        
        if signal == 1 and position is None:
            # BUY signal
            quantity = int(cash // price)
            if quantity > 0:
                cost = quantity * price
                cash -= cost
                position = {
                    "entry_price": price,
                    "quantity": quantity,
                    "entry_time": time_str
                }
        elif signal == -1 and position is not None:
            # SELL signal
            exit_price = price
            qty = position["quantity"]
            entry_price = position["entry_price"]
            
            revenue = qty * exit_price
            cash += revenue
            pnl = revenue - (qty * entry_price)
            return_pct = (exit_price - entry_price) / entry_price * 100
            
            trades.append({
                "ticker": ticker_name,
                "strategy": "RSI Strategy",
                "mode": "backtest",
                "entry_time": position["entry_time"],
                "entry_price": float(entry_price),
                "exit_time": time_str,
                "exit_price": float(exit_price),
                "quantity": float(qty),
                "pnl": float(pnl),
                "return_pct": float(return_pct),
                "exit_reason": "RSI Overbought Exit"
            })
            position = None
            
    if position is not None and len(df_signals) > 0:
        last_row = df_signals.iloc[-1]
        last_price = float(last_row[close_col])
        last_time = df_signals.index[-1].strftime('%Y-%m-%d %H:%M:%S') if hasattr(df_signals.index[-1], 'strftime') else str(df_signals.index[-1])
        qty = position["quantity"]
        entry_price = position["entry_price"]
        
        revenue = qty * last_price
        cash += revenue
        pnl = revenue - (qty * entry_price)
        return_pct = (last_price - entry_price) / entry_price * 100
        
        trades.append({
            "ticker": ticker_name,
            "strategy": "RSI Strategy",
            "mode": "backtest",
            "entry_time": position["entry_time"],
            "entry_price": float(entry_price),
            "exit_time": last_time,
            "exit_price": float(last_price),
            "quantity": float(qty),
            "pnl": float(pnl),
            "return_pct": float(return_pct),
            "exit_reason": "End of Backtest"
        })
        position = None
        
    final_capital = cash
    total_trades = len(trades)
    
    # Calculate performance metrics
    win_trades = [t for t in trades if t["pnl"] > 0]
    win_rate = (len(win_trades) / total_trades * 100) if total_trades > 0 else 0.0
    
    profit_loss = final_capital - capital
    profit_loss_pct = (profit_loss / capital) * 100 if capital > 0 else 0.0
    
    # Profit Factor
    gross_profits = sum(t["pnl"] for t in trades if t["pnl"] > 0)
    gross_losses = abs(sum(t["pnl"] for t in trades if t["pnl"] < 0))
    profit_factor = (gross_profits / gross_losses) if gross_losses > 0 else (gross_profits if gross_profits > 0 else 1.0)
    
    # Max Drawdown
    peak = capital
    max_dd = 0.0
    current_cash = capital
    current_shares = 0
    
    for idx, row in df_signals.iterrows():
        curr_price = float(row[close_col])
        sig = int(row['signal'])
        
        if sig == 1 and current_shares == 0:
            current_shares = int(current_cash // curr_price)
            current_cash -= current_shares * curr_price
        elif sig == -1 and current_shares > 0:
            current_cash += current_shares * curr_price
            current_shares = 0
            
        port_val = current_cash + (current_shares * curr_price)
        if port_val > peak:
            peak = port_val
        dd = (peak - port_val) / peak * 100 if peak > 0 else 0.0
        if dd > max_dd:
            max_dd = dd
            
    metrics = {
        "final_capital": float(final_capital),
        "profit_loss": float(profit_loss),
        "profit_loss_pct": float(profit_loss_pct),
        "total_trades": int(total_trades),
        "win_rate": float(win_rate),
        "max_drawdown": float(max_dd),
        "profit_factor": float(profit_factor)
    }
    
    chart_data = []
    for idx, row in df_signals.iterrows():
        time_str = idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx).split(' ')[0]
        sig_str = None
        if row['signal'] == 1:
            sig_str = "BUY"
        elif row['signal'] == -1:
            sig_str = "SELL"
            
        chart_data.append({
            "time": time_str,
            "open": float(row['Open']) if 'Open' in row else float(row[close_col]),
            "high": float(row['High']) if 'High' in row else float(row[close_col]),
            "low": float(row['Low']) if 'Low' in row else float(row[close_col]),
            "close": float(row[close_col]),
            "rsi": float(row['rsi']) if not pd.isna(row['rsi']) else None,
            "signal": sig_str
        })
        
    return {
        "metrics": metrics,
        "trades": trades,
        "chartData": chart_data
    }
