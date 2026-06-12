"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Square, Activity, DollarSign, Percent, TrendingUp, ShieldAlert, Cpu } from "lucide-react";
import { createChart, IChartApi, CandlestickSeries } from "lightweight-charts";
import { API_BASE_URL } from "../config";


interface Position {
  entry_price: number;
  quantity: number;
  entry_time: string;
  current_price: number;
  pnl: number;
  return_pct: number;
}

interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface PaperStatus {
  is_running: boolean;
  ticker: string;
  strategy: string;
  capital: number;
  current_price: number;
  current_position: Position | null;
  last_signal: string;
  chart_data: ChartBar[];
}

// Subcomponent to handle independent lightweight chart instances for each bot
interface BotChartProps {
  data: ChartBar[];
  ticker: string;
  strategy: string;
}

function BotChart({ data, ticker, strategy }: BotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    if (!chartRef.current) {
      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 240,
        layout: {
          background: { color: "#0f141c" },
          textColor: "#94a3b8",
        },
        grid: {
          vertLines: { color: "#1e293b" },
          horzLines: { color: "#1e293b" },
        },
        timeScale: {
          borderColor: "#202b3c",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      chartRef.current = chart;

      const candlestickSeries = (chart as any).addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#10b981",
        wickDownColor: "#ef4444",
        wickUpColor: "#10b981",
      });

      seriesRef.current = candlestickSeries;

      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
          });
        }
      };
      window.addEventListener("resize", handleResize);
    }

    const formattedData = data.map((bar) => {
      const t = bar.time;
      let timeVal: any = t;
      if (t.includes(" ")) {
        timeVal = Math.floor(new Date(t).getTime() / 1000);
      }
      return {
        time: timeVal,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      };
    });

    formattedData.sort((a, b) => (a.time as number) - (b.time as number));
    seriesRef.current.setData(formattedData);
    chartRef.current.timeScale().fitContent();

  }, [data]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} style={{ width: "100%", borderRadius: "6px", overflow: "hidden", border: "1px solid #202b3c" }} />;
}

export default function PaperTrading() {
  // Deploy configurations
  const [ticker, setTicker] = useState("RELIANCE.NS");
  const [strategy, setStrategy] = useState("sma");
  const [capital, setCapital] = useState(100000);

  // States
  const [bots, setBots] = useState<PaperStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch status helper
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/paper/status`);
      if (!res.ok) {
        throw new Error("Failed to connect to backend paper status API.");
      }
      const data: PaperStatus[] = await res.json();
      setBots(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Failed to fetch paper trading console status.");
    } finally {
      setLoading(false);
    }
  };

  // Poll status on mount
  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll status every 3s
    return () => clearInterval(interval);
  }, []);

  // Update strategy parameter from url parameter if parsed
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const strat = urlParams.get("strategy");
      if (strat) {
        setStrategy(strat);
      }
    }
  }, []);

  const handleStartBot = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError(null);

    // Verify if same bot is already running
    const exists = bots.some(b => b.is_running && b.ticker === ticker && b.strategy === strategy);
    if (exists) {
      setError(`Bot for ${ticker} using ${strategy.toUpperCase()} strategy is already running!`);
      setActionLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/paper/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          strategy,
          capital: Number(capital),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to start simulated bot on backend.");
      }

      await fetchStatus();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error starting paper bot.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopBot = async (botTicker: string, botStrategy: string) => {
    setActionLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/paper/stop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker: botTicker,
          strategy: botStrategy
        })
      });

      if (!res.ok) {
        throw new Error("Failed to stop simulated bot on backend.");
      }

      await fetchStatus();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Error stopping paper bot.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && bots.length === 0) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>Connecting Paper Console...</p>
      </div>
    );
  }

  const runningBots = bots.filter(b => b.is_running);

  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Title */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.25rem" }}>Paper Console</h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Launch and monitor multiple trading robots in parallel sandbox environments.</p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{
            width: "12px",
            height: "12px",
            borderRadius: "50%",
            backgroundColor: runningBots.length > 0 ? "#10b981" : "#ef4444",
            boxShadow: runningBots.length > 0 ? "0 0 10px #10b981" : "none",
            display: "inline-block"
          }} />
          <span style={{
            fontWeight: 700,
            fontSize: "0.85rem",
            color: runningBots.length > 0 ? "#10b981" : "#ef4444",
            textTransform: "uppercase"
          }}>
            {runningBots.length} Bots Online
          </span>
        </div>
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

      {/* Grid: Console deployer & Active Console Desk */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr",
        gap: "2.0rem"
      }}>
        {/* Deployer control card */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>Deploy New Trading Bot</h2>
          
          <form onSubmit={handleStartBot} style={{ 
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1.5rem",
            alignItems: "end"
          }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Ticker Symbol</label>
              <input 
                type="text" 
                className="input" 
                value={ticker} 
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="e.g. AAPL, RELIANCE.NS"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Strategy</label>
              <select 
                className="select" 
                value={strategy} 
                onChange={(e) => setStrategy(e.target.value)}
              >
                <option value="sma">SMA Crossover (20/50)</option>
                <option value="rsi">RSI Strategy (30/70)</option>
                <option value="sr_bounce">Support/Resistance Bounce</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Initial Balance (INR)</label>
              <input 
                type="number" 
                className="input" 
                value={capital} 
                onChange={(e) => setCapital(Number(e.target.value))}
                min="1000"
                required
              />
            </div>

            <button 
              type="submit" 
              className="btn btn-success"
              disabled={actionLoading}
              style={{ height: "39px" }}
            >
              <Play size={16} />
              {actionLoading ? "Deploying..." : "Launch Bot Instance"}
            </button>
          </form>
        </div>

        {/* Console monitor desk layout */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>Active Bot Instances Desk ({runningBots.length})</h2>

          {runningBots.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
              {runningBots.map((bot, index) => (
                <div key={index} className="card" style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr", gap: "1.5rem" }}>
                  {/* Bot configuration & signals summary column */}
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "1.25rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f8fafc" }}>{bot.ticker}</h3>
                          <span className="badge badge-accent" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>
                            {bot.strategy.toUpperCase()}
                          </span>
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Allocated: ₹{bot.capital.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                      </div>
                      
                      <button 
                        onClick={() => handleStopBot(bot.ticker, bot.strategy)}
                        className="btn btn-danger"
                        disabled={actionLoading}
                        style={{ padding: "0.35rem 0.75rem", fontSize: "0.75rem" }}
                      >
                        <Square size={12} />
                        Stop
                      </button>
                    </div>

                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem"
                    }}>
                      <div style={{ backgroundColor: "#171e29", padding: "0.75rem", borderRadius: "6px", border: "1px solid #202b3c" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748b", textTransform: "uppercase" }}>Price</div>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, fontFamily: "var(--font-mono)", color: "#3b82f6", marginTop: "0.15rem" }}>
                          ₹{bot.current_price.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ backgroundColor: "#171e29", padding: "0.75rem", borderRadius: "6px", border: "1px solid #202b3c" }}>
                        <div style={{ fontSize: "0.65rem", color: "#64748b", textTransform: "uppercase" }}>Signal</div>
                        <div style={{ 
                          fontSize: "1.1rem", 
                          fontWeight: 700, 
                          marginTop: "0.15rem",
                          color: bot.last_signal === "BUY" ? "#10b981" : bot.last_signal === "SELL" ? "#ef4444" : "#f59e0b"
                        }}>
                          {bot.last_signal}
                        </div>
                      </div>
                    </div>

                    {/* Position info */}
                    {bot.current_position ? (
                      <div style={{
                        border: "1px solid rgba(16, 185, 129, 0.25)",
                        backgroundColor: "rgba(16, 185, 129, 0.02)",
                        borderRadius: "6px",
                        padding: "0.75rem"
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "#64748b", marginBottom: "0.5rem" }}>
                          <span style={{ color: "#10b981", fontWeight: 600 }}>LONG POSITION ACTIVE</span>
                          <span>{bot.current_position.entry_time.split(" ")[1] || ""}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.2fr", gap: "0.5rem", fontSize: "0.75rem" }}>
                          <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.65rem" }}>Qty</span>
                            <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{bot.current_position.quantity}</span>
                          </div>
                          <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.65rem" }}>Entry</span>
                            <span style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>₹{bot.current_position.entry_price.toFixed(2)}</span>
                          </div>
                          <div>
                            <span style={{ color: "#64748b", display: "block", fontSize: "0.65rem" }}>P&L (%)</span>
                            <span style={{ 
                              fontWeight: 700, 
                              fontFamily: "var(--font-mono)",
                              color: bot.current_position.pnl >= 0 ? "#10b981" : "#ef4444"
                            }}>
                              ₹{bot.current_position.pnl.toFixed(2)} ({bot.current_position.return_pct.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        border: "1px dashed #202b3c",
                        borderRadius: "6px",
                        padding: "0.75rem",
                        textAlign: "center",
                        fontSize: "0.75rem",
                        color: "#64748b"
                      }}>
                        No active position. Scanning indicators...
                      </div>
                    )}
                  </div>

                  {/* Chart component column */}
                  <div>
                    {bot.chart_data && bot.chart_data.length > 0 ? (
                      <BotChart data={bot.chart_data} ticker={bot.ticker} strategy={bot.strategy} />
                    ) : (
                      <div style={{
                        height: "240px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: "#0f141c",
                        border: "1px solid #202b3c",
                        borderRadius: "6px",
                        color: "#64748b",
                        fontSize: "0.85rem"
                      }}>
                        Waiting for price tick streams...
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              textAlign: "center",
              padding: "3rem",
              color: "#64748b",
              backgroundColor: "rgba(255, 255, 255, 0.01)",
              borderRadius: "8px",
              border: "1px dashed #202b3c",
              fontSize: "0.95rem"
            }}>
              No active bots running. Configure options and click "Launch Bot" above.
            </div>
          )}
        </div>
      </div>

      {/* Security info banner */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        backgroundColor: "rgba(59, 130, 246, 0.05)",
        border: "1px solid rgba(59, 130, 246, 0.2)",
        borderRadius: "8px",
        padding: "1rem",
        color: "#94a3b8",
        fontSize: "0.85rem"
      }}>
        <ShieldAlert size={20} className="text-warning" style={{ flexShrink: 0 }} />
        <p>
          <strong>Simulated Sandbox Engine:</strong> This terminal runs on virtual funds. The candlestick chart aggregates simulated live price fluctuations generated via random walk drift calculations. Exit and Entry transactions will execute automatically based on strategy math.
        </p>
      </div>
    </div>
  );
}
