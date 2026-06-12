"use client";

import { useEffect, useState } from "react";
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Layers, 
  Activity, 
  PieChart 
} from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "../config";

interface Trade {
  id: number;
  ticker: string;
  strategy: string;
  mode: string;
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  quantity: number;
  pnl: number;
  return_pct: number;
  exit_reason: string;
}

interface Position {
  entry_price: number;
  quantity: number;
  entry_time: string;
  current_price: number;
  pnl: number;
  return_pct: number;
}

interface PaperStatus {
  is_running: boolean;
  ticker: string;
  strategy: string;
  capital: number;
  current_price: number;
  current_position: Position | null;
  last_signal: string;
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [paperBots, setPaperBots] = useState<PaperStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusRes, tradesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/paper/status`),
          fetch(`${API_BASE_URL}/trades`)
        ]);

        if (!statusRes.ok || !tradesRes.ok) {
          throw new Error("Failed to fetch data from trading API backend.");
        }

        const statusData = await statusRes.json();
        const tradesData = await tradesRes.json();

        setPaperBots(statusData);
        setTrades(tradesData);
        setError(null);
      } catch (err: any) {
        console.error(err);
        setError("Unable to connect to trading backend server. Is it running on port 8000?");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 4000); // Poll every 4s for real-time portfolio updates
    return () => clearInterval(interval);
  }, []);

  // Filter paper trades
  const paperTrades = trades.filter((t) => t.mode === "paper");
  
  // Calculate summary metrics
  const totalTrades = paperTrades.length;
  const winTrades = paperTrades.filter((t) => t.pnl > 0);
  const winRate = totalTrades > 0 ? (winTrades.length / totalTrades) * 100 : 0.0;
  
  const totalRealizedPnl = paperTrades.reduce((sum, t) => sum + t.pnl, 0);
  
  // Sum aggregates across all bots
  const runningBots = paperBots.filter(bot => bot.is_running);
  const activePositions = paperBots.filter(bot => bot.current_position !== null);
  
  // Total cash balance is the sum of capitals of all bot instances (active or saved)
  // If no bots are registered yet, default to starting balance of 100,000
  const cashBalance = paperBots.length > 0 
    ? paperBots.reduce((sum, bot) => sum + bot.capital, 0)
    : 100000.0;
    
  // Sum current position values
  const positionValue = activePositions.reduce((sum, bot) => {
    if (bot.current_position) {
      return sum + (bot.current_position.quantity * bot.current_price);
    }
    return sum;
  }, 0);
  
  const totalPortfolioValue = cashBalance + positionValue;
  const unrealizedPnl = activePositions.reduce((sum, bot) => sum + (bot.current_position?.pnl || 0.0), 0);
  
  // Overall P&L (Realized + Unrealized)
  const totalPnl = totalRealizedPnl + unrealizedPnl;
  
  // Starting capital is computed dynamically based on bot instances (each bot typically starts with 100k)
  // Standardized dynamic calculation relative to aggregate allocated capital
  const startingCapital = paperBots.length > 0 ? (paperBots.length * 100000.0) : 100000.0;
  const totalReturnPct = ((totalPortfolioValue - startingCapital) / startingCapital) * 100;

  if (loading && trades.length === 0) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>Booting Dashboard Engine...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.25rem" }}>Trading Desk</h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Real-time dashboard monitor for simulated active algo bots.</p>
        </div>
        
        {runningBots.length > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#10b981",
              display: "inline-block",
              boxShadow: "0 0 10px #10b981"
            }} />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#10b981", textTransform: "uppercase" }}>
              {runningBots.length} Bots Online
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#64748b",
              display: "inline-block"
            }} />
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>
              Bots Standby
            </span>
          </div>
        )}
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

      {/* Grid Metrics */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "1.5rem"
      }}>
        {/* Metric 1 */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
            <span className="card-title">Paper Liquidity</span>
            <DollarSign size={16} />
          </div>
          <div className="card-value">₹{cashBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Available virtual cash balance</span>
        </div>

        {/* Metric 2 */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
            <span className="card-title">Aggregate Valuation</span>
            <PieChart size={16} />
          </div>
          <div className="card-value">₹{totalPortfolioValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <span style={{ 
            fontSize: "0.75rem", 
            color: totalReturnPct >= 0 ? "#10b981" : "#ef4444",
            fontWeight: 600
          }}>
            {totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(2)}% Return
          </span>
        </div>

        {/* Metric 3 */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
            <span className="card-title">Simulated Desk P&L</span>
            {totalPnl >= 0 ? <TrendingUp size={16} className="text-success" /> : <TrendingDown size={16} className="text-danger" />}
          </div>
          <div className={`card-value ${totalPnl >= 0 ? "text-success" : "text-danger"}`}>
            ₹{totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            Realized: ₹{totalRealizedPnl.toFixed(2)} | Unrealized: ₹{unrealizedPnl.toFixed(2)}
          </span>
        </div>

        {/* Metric 4 */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b" }}>
            <span className="card-title">Total Logs</span>
            <Activity size={16} />
          </div>
          <div className="card-value">{totalTrades} Trades</div>
          <span style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600 }}>
            Avg Win Rate: <span className="text-success">{winRate.toFixed(1)}%</span>
          </span>
        </div>
      </div>

      {/* Active Positions Table & Live Signals list */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: "1.5rem",
        alignItems: "start"
      }}>
        {/* Left Column: Active Positions */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", minHeight: "260px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>Active Positions ({activePositions.length})</h2>
          </div>

          {activePositions.length > 0 ? (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th>Strategy</th>
                    <th>Qty</th>
                    <th>Entry Price</th>
                    <th>Current Price</th>
                    <th>Unrealized P&L</th>
                    <th>Return %</th>
                  </tr>
                </thead>
                <tbody>
                  {activePositions.map((bot, index) => {
                    const pos = bot.current_position!;
                    return (
                      <tr key={index}>
                        <td style={{ fontWeight: 700 }}>{bot.ticker}</td>
                        <td style={{ color: "#94a3b8" }}>{bot.strategy.toUpperCase()}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>{pos.quantity}</td>
                        <td style={{ fontFamily: "var(--font-mono)" }}>₹{pos.entry_price.toFixed(2)}</td>
                        <td style={{ fontFamily: "var(--font-mono)", color: "#3b82f6" }}>₹{bot.current_price.toFixed(2)}</td>
                        <td style={{ 
                          fontWeight: 700, 
                          fontFamily: "var(--font-mono)",
                          color: pos.pnl >= 0 ? "#10b981" : "#ef4444" 
                        }}>
                          ₹{pos.pnl.toFixed(2)}
                        </td>
                        <td style={{ 
                          fontWeight: 700, 
                          fontFamily: "var(--font-mono)",
                          color: pos.pnl >= 0 ? "#10b981" : "#ef4444" 
                        }}>
                          {pos.return_pct >= 0 ? "+" : ""}{pos.return_pct.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ 
              display: "flex", 
              flexDirection: "column", 
              alignItems: "center", 
              justifyContent: "center", 
              padding: "2rem", 
              gap: "0.75rem",
              color: "#64748b",
              backgroundColor: "rgba(255, 255, 255, 0.01)",
              borderRadius: "8px",
              border: "1px dashed #202b3c",
              flex: 1
            }}>
              <p style={{ fontSize: "0.9rem", fontWeight: 500 }}>No open positions across active bots.</p>
              <Link href="/paper" className="btn btn-secondary" style={{ padding: "0.5rem 1rem", fontSize: "0.75rem" }}>
                Open Paper Console
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: Live Indicators */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem", minHeight: "260px" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>Running Bot Signals</h2>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {runningBots.length > 0 ? (
              runningBots.map((bot, index) => (
                <div key={index} style={{
                  backgroundColor: "#171e29",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  border: "1px solid #202b3c",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                  <div>
                    <span style={{ fontWeight: 700, color: "#f8fafc" }}>{bot.ticker}</span>
                    <span style={{ color: "#64748b", fontSize: "0.75rem", marginLeft: "0.5rem" }}>({bot.strategy.toUpperCase()})</span>
                  </div>
                  <span className={`badge ${
                    bot.last_signal === "BUY" 
                      ? "badge-success" 
                      : bot.last_signal === "SELL" 
                        ? "badge-danger" 
                        : "badge-warning"
                  }`}>
                    {bot.last_signal}
                  </span>
                </div>
              ))
            ) : (
              <div style={{
                color: "#64748b",
                fontSize: "0.85rem",
                textAlign: "center",
                padding: "2rem",
                border: "1px dashed #202b3c",
                borderRadius: "8px"
              }}>
                No running bots online.
              </div>
            )}

            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "0.5rem" }}>
              <Link href="/strategies" style={{ color: "#3b82f6", fontWeight: 600 }}>View Strategy Rules &rarr;</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Paper Trades Section */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>Recent Sandbox Logs</h2>
          <Link href="/trades" style={{ color: "#3b82f6", fontSize: "0.85rem", fontWeight: 600 }}>
            View All Logs &rarr;
          </Link>
        </div>

        {paperTrades.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Strategy</th>
                  <th>Entry Details</th>
                  <th>Exit Details</th>
                  <th>Qty</th>
                  <th>P&L</th>
                  <th>Return %</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {paperTrades.slice(0, 5).map((trade) => (
                  <tr key={trade.id}>
                    <td style={{ fontWeight: 700 }}>{trade.ticker}</td>
                    <td style={{ color: "#94a3b8" }}>{trade.strategy}</td>
                    <td>
                      <div>₹{trade.entry_price.toFixed(2)}</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{trade.entry_time.split(" ")[1] || trade.entry_time}</div>
                    </td>
                    <td>
                      <div>₹{trade.exit_price.toFixed(2)}</div>
                      <div style={{ fontSize: "0.7rem", color: "#64748b" }}>{trade.exit_time.split(" ")[1] || trade.exit_time}</div>
                    </td>
                    <td>{trade.quantity}</td>
                    <td className={trade.pnl >= 0 ? "text-success" : "text-danger"} style={{ fontWeight: 700 }}>
                      ₹{trade.pnl.toFixed(2)}
                    </td>
                    <td className={trade.pnl >= 0 ? "text-success" : "text-danger"} style={{ fontWeight: 700 }}>
                      {trade.return_pct >= 0 ? "+" : ""}{trade.return_pct.toFixed(2)}%
                    </td>
                    <td style={{ color: "#64748b", fontSize: "0.8rem" }}>{trade.exit_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ 
            textAlign: "center", 
            padding: "2rem", 
            color: "#64748b", 
            backgroundColor: "rgba(255, 255, 255, 0.01)",
            borderRadius: "8px",
            border: "1px dashed #202b3c"
          }}>
            No paper trades registered yet. Make sure to launch bots in the Paper Console!
          </div>
        )}
      </div>
    </div>
  );
}
