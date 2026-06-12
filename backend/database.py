import sqlite3
import os
import json
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trading.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. trades table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticker TEXT NOT NULL,
        strategy TEXT NOT NULL,
        mode TEXT NOT NULL, -- 'backtest' or 'paper'
        entry_time TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_time TEXT NOT NULL,
        exit_price REAL NOT NULL,
        quantity REAL NOT NULL,
        pnl REAL NOT NULL,
        return_pct REAL NOT NULL,
        exit_reason TEXT
    )
    """)
    
    # Drop and Re-create paper_state for composite key migration safety
    cursor.execute("DROP TABLE IF EXISTS paper_state")
    
    # 2. paper_state table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS paper_state (
        ticker TEXT NOT NULL,
        strategy TEXT NOT NULL,
        is_running INTEGER DEFAULT 0,
        capital REAL DEFAULT 100000.0,
        current_position TEXT, -- JSON string representing open position
        last_signal TEXT DEFAULT 'HOLD',
        updated_at TEXT,
        PRIMARY KEY (ticker, strategy)
    )
    """)
        
    conn.commit()
    conn.close()

def save_trade(trade_data: dict):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO trades (ticker, strategy, mode, entry_time, entry_price, exit_time, exit_price, quantity, pnl, return_pct, exit_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        trade_data["ticker"],
        trade_data["strategy"],
        trade_data["mode"],
        trade_data["entry_time"],
        trade_data["entry_price"],
        trade_data["exit_time"],
        trade_data["exit_price"],
        trade_data["quantity"],
        trade_data["pnl"],
        trade_data["return_pct"],
        trade_data.get("exit_reason", "Signal Exit")
    ))
    conn.commit()
    conn.close()

def get_all_trades():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM trades ORDER BY exit_time DESC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_paper_state(ticker: str, strategy: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM paper_state WHERE ticker = ? AND strategy = ?", (ticker, strategy))
    row = cursor.fetchone()
    conn.close()
    if row:
        state = dict(row)
        # Parse current_position JSON if it exists
        if state["current_position"]:
            state["current_position"] = json.loads(state["current_position"])
        return state
    return None

def get_all_paper_states():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM paper_state")
    rows = cursor.fetchall()
    conn.close()
    
    states = []
    for row in rows:
        state = dict(row)
        if state["current_position"]:
            state["current_position"] = json.loads(state["current_position"])
        states.append(state)
    return states

def update_paper_state(ticker: str, strategy: str, is_running: int = None, 
                       capital: float = None, current_position: dict = None, last_signal: str = None):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if this bot state already exists
    cursor.execute("SELECT * FROM paper_state WHERE ticker = ? AND strategy = ?", (ticker, strategy))
    row = cursor.fetchone()
    
    updated_at = datetime.now().isoformat()
    
    if row:
        state = dict(row)
        new_is_running = is_running if is_running is not None else state["is_running"]
        new_capital = capital if capital is not None else state["capital"]
        
        if current_position is not None:
            new_position_str = json.dumps(current_position) if current_position else None
        else:
            new_position_str = state["current_position"]
            
        new_last_signal = last_signal if last_signal is not None else state["last_signal"]
        
        cursor.execute("""
        UPDATE paper_state
        SET is_running = ?, capital = ?, current_position = ?, last_signal = ?, updated_at = ?
        WHERE ticker = ? AND strategy = ?
        """, (new_is_running, new_capital, new_position_str, new_last_signal, updated_at, ticker, strategy))
    else:
        new_is_running = is_running if is_running is not None else 0
        new_capital = capital if capital is not None else 100000.0
        new_position_str = json.dumps(current_position) if current_position else None
        new_last_signal = last_signal if last_signal is not None else "HOLD"
        
        cursor.execute("""
        INSERT INTO paper_state (ticker, strategy, is_running, capital, current_position, last_signal, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (ticker, strategy, new_is_running, new_capital, new_position_str, new_last_signal, updated_at))
        
    conn.commit()
    conn.close()
