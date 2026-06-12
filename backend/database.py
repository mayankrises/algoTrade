import sqlite3
import os
import json
from datetime import datetime

# Try importing psycopg2 for optional PostgreSQL connectivity
try:
    import psycopg2
    import psycopg2.extras
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

DB_PATH = os.getenv("DATABASE_URL", "")

def is_postgresql():
    return HAS_PSYCOPG2 and (DB_PATH.startswith("postgresql://") or DB_PATH.startswith("postgres://"))

def get_db_connection():
    if is_postgresql():
        # Connect to PostgreSQL
        conn = psycopg2.connect(DB_PATH)
        return conn
    else:
        # Fallback to local SQLite
        sqlite_file = DB_PATH if DB_PATH and not (DB_PATH.startswith("postgresql://") or DB_PATH.startswith("postgres://")) else os.path.join(os.path.dirname(os.path.abspath(__file__)), "trading.db")
        conn = sqlite3.connect(sqlite_file)
        conn.row_factory = sqlite3.Row
        return conn

def execute_query(conn, cursor, query, params=None):
    is_pg = is_postgresql()
    # Standardise placeholders: replace %s with ? if SQLite is being used
    if not is_pg:
        query = query.replace("%s", "?")
    
    if params is not None:
        cursor.execute(query, params)
    else:
        cursor.execute(query)

def fetch_all_as_dicts(cursor, is_pg):
    if is_pg:
        return list(cursor.fetchall())
    else:
        return [dict(row) for row in cursor.fetchall()]

def fetch_one_as_dict(cursor, is_pg):
    row = cursor.fetchone()
    if row:
        return dict(row)
    return None

def init_db():
    conn = get_db_connection()
    is_pg = is_postgresql()
    cursor = conn.cursor()
    
    # 1. trades table
    if is_pg:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id SERIAL PRIMARY KEY,
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
    else:
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT NOT NULL,
            strategy TEXT NOT NULL,
            mode TEXT NOT NULL,
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
    
    # 2. paper_state table (identical key setup compatible across both dialects)
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
    
    query = """
    INSERT INTO trades (ticker, strategy, mode, entry_time, entry_price, exit_time, exit_price, quantity, pnl, return_pct, exit_reason)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    execute_query(conn, cursor, query, (
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
    is_pg = is_postgresql()
    if is_pg:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        cursor = conn.cursor()
        
    query = "SELECT * FROM trades ORDER BY exit_time DESC"
    execute_query(conn, cursor, query)
    rows = fetch_all_as_dicts(cursor, is_pg)
    conn.close()
    return rows

def get_paper_state(ticker: str, strategy: str):
    conn = get_db_connection()
    is_pg = is_postgresql()
    if is_pg:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        cursor = conn.cursor()
        
    query = "SELECT * FROM paper_state WHERE ticker = %s AND strategy = %s"
    execute_query(conn, cursor, query, (ticker, strategy))
    row = fetch_one_as_dict(cursor, is_pg)
    conn.close()
    
    if row:
        # Parse current_position JSON if it exists
        if row["current_position"]:
            row["current_position"] = json.loads(row["current_position"])
        return row
    return None

def get_all_paper_states():
    conn = get_db_connection()
    is_pg = is_postgresql()
    if is_pg:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        cursor = conn.cursor()
        
    query = "SELECT * FROM paper_state"
    execute_query(conn, cursor, query)
    rows = fetch_all_as_dicts(cursor, is_pg)
    conn.close()
    
    states = []
    for row in rows:
        if row["current_position"]:
            row["current_position"] = json.loads(row["current_position"])
        states.append(row)
    return states

def update_paper_state(ticker: str, strategy: str, is_running: int = None, 
                        capital: float = None, current_position: dict = None, last_signal: str = None):
    conn = get_db_connection()
    is_pg = is_postgresql()
    if is_pg:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    else:
        cursor = conn.cursor()
    
    # Check if this bot state already exists
    query_select = "SELECT * FROM paper_state WHERE ticker = %s AND strategy = %s"
    execute_query(conn, cursor, query_select, (ticker, strategy))
    row = fetch_one_as_dict(cursor, is_pg)
    
    updated_at = datetime.now().isoformat()
    
    if row:
        new_is_running = is_running if is_running is not None else row["is_running"]
        new_capital = capital if capital is not None else row["capital"]
        
        if current_position is not None:
            new_position_str = json.dumps(current_position) if current_position else None
        else:
            new_position_str = row["current_position"]
            
        new_last_signal = last_signal if last_signal is not None else row["last_signal"]
        
        query_update = """
        UPDATE paper_state
        SET is_running = %s, capital = %s, current_position = %s, last_signal = %s, updated_at = %s
        WHERE ticker = %s AND strategy = %s
        """
        execute_query(conn, cursor, query_update, (new_is_running, new_capital, new_position_str, new_last_signal, updated_at, ticker, strategy))
    else:
        new_is_running = is_running if is_running is not None else 0
        new_capital = capital if capital is not None else 100000.0
        new_position_str = json.dumps(current_position) if current_position else None
        new_last_signal = last_signal if last_signal is not None else "HOLD"
        
        query_insert = """
        INSERT INTO paper_state (ticker, strategy, is_running, capital, current_position, last_signal, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        execute_query(conn, cursor, query_insert, (ticker, strategy, new_is_running, new_capital, new_position_str, new_last_signal, updated_at))
        
    conn.commit()
    conn.close()
