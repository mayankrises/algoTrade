"use client";

import { useEffect, useState } from "react";
import { History, Search, ArrowUpDown, Filter } from "lucide-react";

interface Trade {
  id: number;
  ticker: string;
  strategy: string;
  mode: string; // 'backtest' or 'paper'
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  quantity: number;
  pnl: number;
  return_pct: number;
  exit_reason: string;
}

export default function TradeLog() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter settings
  const [filterMode, setFilterMode] = useState<"all" | "paper" | "backtest">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const res = await fetch("http://localhost:8000/trades");
        if (!res.ok) {
          throw new Error("Failed to load trades from API database.");
        }
        const data = await res.json();
        setTrades(data);
      } catch (err: any) {
        console.error(err);
        setError("Unable to connect to trading backend database.");
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
    const interval = setInterval(fetchTrades, 5000); // refresh list every 5s
    return () => clearInterval(interval);
  }, []);

  // Filter and search logic
  const filteredTrades = trades.filter((trade) => {
    const matchesMode = filterMode === "all" || trade.mode === filterMode;
    const matchesSearch = 
      trade.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trade.strategy.toLowerCase().includes(searchQuery.toLowerCase()) ||
      trade.exit_reason.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesMode && matchesSearch;
  });

  if (loading && trades.length === 0) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>Reading Trade Logs...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.25rem" }}>Trade Log</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Auditable records of all virtual entries, exits, and strategy metrics.</p>
      </div>

      {error && (
        <div style={{
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#ef4444",
          borderRadius: "8px",
          padding: "1rem",
          fontSize: "0.9rem",
          fontWeight: 500
        }}>
          ⚠️ {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="card" style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        padding: "1rem"
      }}>
        {/* Toggle Mode Filters */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button 
            onClick={() => setFilterMode("all")}
            className="btn"
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.8rem",
              backgroundColor: filterMode === "all" ? "#202b3c" : "transparent",
              borderColor: "#202b3c",
              color: filterMode === "all" ? "#ffffff" : "#94a3b8"
            }}
          >
            All Logs ({trades.length})
          </button>
          <button 
            onClick={() => setFilterMode("paper")}
            className="btn"
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.8rem",
              backgroundColor: filterMode === "paper" ? "#202b3c" : "transparent",
              borderColor: "#202b3c",
              color: filterMode === "paper" ? "#ffffff" : "#94a3b8"
            }}
          >
            Paper Sandbox ({trades.filter(t => t.mode === "paper").length})
          </button>
          <button 
            onClick={() => setFilterMode("backtest")}
            className="btn"
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.8rem",
              backgroundColor: filterMode === "backtest" ? "#202b3c" : "transparent",
              borderColor: "#202b3c",
              color: filterMode === "backtest" ? "#ffffff" : "#94a3b8"
            }}
          >
            Backtests ({trades.filter(t => t.mode === "backtest").length})
          </button>
        </div>

        {/* Text Filter search bar */}
        <div style={{
          display: "flex",
          alignItems: "center",
          backgroundColor: "#171e29",
          border: "1px solid #202b3c",
          borderRadius: "6px",
          padding: "0.375rem 0.75rem",
          gap: "0.5rem",
          minWidth: "260px"
        }}>
          <Search size={16} style={{ color: "#64748b" }} />
          <input 
            type="text"
            placeholder="Search symbol, strategy..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "none",
              border: "none",
              outline: "none",
              color: "#f8fafc",
              fontSize: "0.85rem",
              width: "100%"
            }}
          />
        </div>
      </div>

      {/* Trades Table */}
      <div className="card" style={{ padding: 0 }}>
        {filteredTrades.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: "1.5rem" }}>Symbol</th>
                  <th>Strategy</th>
                  <th>Mode</th>
                  <th>Entry Details</th>
                  <th>Exit Details</th>
                  <th>Qty</th>
                  <th>PnL (INR)</th>
                  <th>Return %</th>
                  <th style={{ paddingRight: "1.5rem" }}>Exit Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrades.map((trade) => (
                  <tr key={trade.id}>
                    <td style={{ paddingLeft: "1.5rem", fontWeight: 700 }}>
                      {trade.ticker}
                    </td>
                    <td>{trade.strategy}</td>
                    <td>
                      <span className={`badge ${trade.mode === "paper" ? "badge-success" : "badge-accent"}`}>
                        {trade.mode}
                      </span>
                    </td>
                    <td>
                      <div>₹{trade.entry_price.toFixed(2)}</div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                        {trade.entry_time.split(" ")[0]} <span style={{ color: "#475569" }}>{trade.entry_time.split(" ")[1] || ""}</span>
                      </span>
                    </td>
                    <td>
                      <div>₹{trade.exit_price.toFixed(2)}</div>
                      <span style={{ fontSize: "0.7rem", color: "#64748b" }}>
                        {trade.exit_time.split(" ")[0]} <span style={{ color: "#475569" }}>{trade.exit_time.split(" ")[1] || ""}</span>
                      </span>
                    </td>
                    <td style={{ fontFamily: "var(--font-mono)" }}>
                      {trade.quantity}
                    </td>
                    <td className={trade.pnl >= 0 ? "text-success" : "text-danger"} style={{ fontWeight: 700 }}>
                      ₹{trade.pnl.toFixed(2)}
                    </td>
                    <td className={trade.pnl >= 0 ? "text-success" : "text-danger"} style={{ fontWeight: 700 }}>
                      {trade.return_pct >= 0 ? "+" : ""}{trade.return_pct.toFixed(2)}%
                    </td>
                    <td style={{ paddingRight: "1.5rem", color: "#94a3b8" }}>
                      {trade.exit_reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{
            padding: "3rem",
            textAlign: "center",
            color: "#64748b",
            fontSize: "0.95rem"
          }}>
            No matching trade logs found.
          </div>
        )}
      </div>
    </div>
  );
}
