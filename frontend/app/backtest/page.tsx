"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Calendar, DollarSign, Award, Percent, TrendingDown, Layers } from "lucide-react";
import { createChart, IChartApi, CandlestickSeries, LineSeries, createSeriesMarkers } from "lightweight-charts";
import { API_BASE_URL } from "../config";


interface MetricType {
  final_capital: number;
  profit_loss: number;
  profit_loss_pct: number;
  total_trades: number;
  win_rate: number;
  max_drawdown: number;
  profit_factor: number;
}

interface TradeType {
  ticker: string;
  strategy: string;
  entry_time: string;
  entry_price: number;
  exit_time: string;
  exit_price: number;
  quantity: number;
  pnl: number;
  return_pct: number;
  exit_reason: string;
}

interface ChartDataType {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  sma20?: number | null;
  sma50?: number | null;
  rsi?: number | null;
  support?: number | null;
  resistance?: number | null;
  signal?: "BUY" | "SELL" | null;
}

export default function Backtest() {
  // Backtest Inputs
  const [ticker, setTicker] = useState("RELIANCE.NS");
  const [strategy, setStrategy] = useState("sma");
  const [capital, setCapital] = useState(100000);
  const [startDate, setStartDate] = useState("2024-01-01");
  const [endDate, setEndDate] = useState("2025-01-01");
  const [timeframe, setTimeframe] = useState("1d");

  // Available strategies (fetched from API)
  const [availableStrategies, setAvailableStrategies] = useState<{id: string; name: string; is_custom?: boolean}[]>([
    { id: "sma", name: "SMA Crossover (20/50)" },
    { id: "rsi", name: "RSI Strategy (30/70)" },
    { id: "sr_bounce", name: "Support/Resistance Bounce" }
  ]);

  // Fetch strategies list
  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/strategies`);
        if (res.ok) {
          const data = await res.json();
          setAvailableStrategies(data.map((s: any) => ({ id: s.id, name: s.name, is_custom: s.is_custom })));
        }
      } catch (e) {
        console.error("Failed to fetch strategies list:", e);
      }
    };
    fetchStrategies();
  }, []);

  // Read preselected strategy from query parameters if loaded
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      const strat = urlParams.get("strategy");
      if (strat) {
        setStrategy(strat);
      }
    }
  }, []);

  // Output States
  const [metrics, setMetrics] = useState<MetricType | null>(null);
  const [trades, setTrades] = useState<TradeType[]>([]);
  const [chartData, setChartData] = useState<ChartDataType[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chart Ref
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  // Render TradingView Candlestick Chart
  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    // Remove any previous charts first
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#0f141c" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      crosshair: {
        mode: 0,
      },
      timeScale: {
        borderColor: "#202b3c",
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

    // Format candlesticks
    const candles = chartData.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candlestickSeries.setData(candles);

    // Overlays based on Strategy Indicators
    if (strategy === "sma" && chartData[0]?.sma20 !== undefined) {
      const sma20Series = (chart as any).addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 1.5,
        title: "SMA 20",
      });
      const sma20Data = chartData
        .filter((d) => d.sma20 !== null && d.sma20 !== undefined)
        .map((d) => ({ time: d.time, value: d.sma20 as number }));
      sma20Series.setData(sma20Data);

      const sma50Series = (chart as any).addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 1.5,
        title: "SMA 50",
      });
      const sma50Data = chartData
        .filter((d) => d.sma50 !== null && d.sma50 !== undefined)
        .map((d) => ({ time: d.time, value: d.sma50 as number }));
      sma50Series.setData(sma50Data);
    }

    if (strategy === "sr_bounce" && chartData[0]?.support !== undefined) {
      const supportSeries = (chart as any).addSeries(LineSeries, {
        color: "#10b981",
        lineWidth: 1.2,
        lineStyle: 2, // Dashed
        title: "Support",
      });
      const supportData = chartData
        .filter((d) => d.support !== null && d.support !== undefined)
        .map((d) => ({ time: d.time, value: d.support as number }));
      supportSeries.setData(supportData);

      const resSeries = (chart as any).addSeries(LineSeries, {
        color: "#ef4444",
        lineWidth: 1.2,
        lineStyle: 2, // Dashed
        title: "Resistance",
      });
      const resData = chartData
        .filter((d) => d.resistance !== null && d.resistance !== undefined)
        .map((d) => ({ time: d.time, value: d.resistance as number }));
      resSeries.setData(resData);
    }

    // Buy/Sell Markers annotations
    const markers = [];
    for (let i = 0; i < chartData.length; i++) {
      const bar = chartData[i];
      if (bar.signal === "BUY") {
        markers.push({
          time: bar.time,
          position: "belowBar" as const,
          color: "#10b981",
          shape: "arrowUp" as const,
          text: "BUY",
        });
      } else if (bar.signal === "SELL") {
        markers.push({
          time: bar.time,
          position: "aboveBar" as const,
          color: "#ef4444",
          shape: "arrowDown" as const,
          text: "SELL",
        });
      }
    }
    createSeriesMarkers(candlestickSeries, markers);

    // Fit content
    chart.timeScale().fitContent();

    // Resize Handler
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [chartData, strategy]);

  const handleRunBacktest = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setError(null);
    setMetrics(null);
    setTrades([]);
    setChartData([]);

    try {
      const res = await fetch(`${API_BASE_URL}/backtest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticker,
          strategy,
          capital: Number(capital),
          start: startDate,
          end: endDate,
          timeframe,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Error running backtest on server.");
      }

      setMetrics(data.metrics);
      setTrades(data.trades);
      setChartData(data.chartData);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to execute backtest. Verify backend connection.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.25rem" }}>Backtester</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Run technical strategy simulations on historical market price data.</p>
      </div>

      {/* Inputs Form card */}
      <div className="card">
        <form onSubmit={handleRunBacktest} style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1.25rem",
          alignItems: "end"
        }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Ticker Symbol</label>
            <input 
              type="text" 
              className="input" 
              value={ticker} 
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. RELIANCE.NS"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Strategy</label>
            <select className="select" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              {availableStrategies.filter(s => !s.is_custom).map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              {availableStrategies.some(s => s.is_custom) && (
                <optgroup label="Custom Strategies">
                  {availableStrategies.filter(s => s.is_custom).map(s => (
                    <option key={s.id} value={s.id}>⚡ {s.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Timeframe</label>
            <select className="select" value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              <option value="1d">Daily</option>
              <option value="1h">Hourly</option>
              <option value="15m">15 Min</option>
              <option value="5m">5 Min</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Virtual Cash (INR)</label>
            <input 
              type="number" 
              className="input" 
              value={capital} 
              onChange={(e) => setCapital(Number(e.target.value))}
              min="1000"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Start Date</label>
            <input 
              type="date" 
              className="input" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>End Date</label>
            <input 
              type="date" 
              className="input" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary" 
            disabled={running}
            style={{ height: "39px" }}
          >
            <Play size={16} />
            {running ? "Simulating..." : "Run Backtest"}
          </button>
        </form>
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

      {/* Output Panel */}
      {metrics && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Performance Summary Cards */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "1.25rem"
          }}>
            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.5rem" }}>
                <span>Final capital</span>
                <DollarSign size={14} />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                ₹{metrics.final_capital.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: "0.75rem", color: metrics.profit_loss >= 0 ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                {metrics.profit_loss >= 0 ? "+" : ""}₹{metrics.profit_loss.toFixed(2)}
              </span>
            </div>

            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.5rem" }}>
                <span>Net Return</span>
                <Percent size={14} />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: metrics.profit_loss_pct >= 0 ? "#10b981" : "#ef4444" }}>
                {metrics.profit_loss_pct >= 0 ? "+" : ""}{metrics.profit_loss_pct.toFixed(2)}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>ROI over backtest period</span>
            </div>

            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.5rem" }}>
                <span>Total Trades</span>
                <Layers size={14} />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {metrics.total_trades}
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                Win Rate: <span className="text-success" style={{ fontWeight: 600 }}>{metrics.win_rate.toFixed(1)}%</span>
              </span>
            </div>

            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.5rem" }}>
                <span>Max Drawdown</span>
                <TrendingDown size={14} className="text-danger" />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#ef4444" }}>
                {metrics.max_drawdown.toFixed(2)}%
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Peak-to-trough capital dip</span>
            </div>

            <div className="card" style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: 600, marginBottom: "0.5rem" }}>
                <span>Profit Factor</span>
                <Award size={14} />
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
                {metrics.profit_factor.toFixed(2)}
              </div>
              <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Gross Gain / Gross Loss</span>
            </div>
          </div>

          {/* Candlestick Chart */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Simulated Candlestick Chart</h3>
            <div ref={chartContainerRef} style={{ width: "100%", borderRadius: "8px", overflow: "hidden" }} />
          </div>

          {/* Trade log table */}
          <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>Execution Logs ({trades.length} trades)</h3>
            
            {trades.length > 0 ? (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Strategy</th>
                      <th>Entry Time</th>
                      <th>Entry Price</th>
                      <th>Exit Time</th>
                      <th>Exit Price</th>
                      <th>Qty</th>
                      <th>PnL (INR)</th>
                      <th>Return %</th>
                      <th>Exit Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.map((t, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: 700 }}>{t.strategy}</td>
                        <td>{t.entry_time.split(" ")[0]} <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{t.entry_time.split(" ")[1] || ""}</span></td>
                        <td>₹{t.entry_price.toFixed(2)}</td>
                        <td>{t.exit_time.split(" ")[0]} <span style={{ color: "#64748b", fontSize: "0.75rem" }}>{t.exit_time.split(" ")[1] || ""}</span></td>
                        <td>₹{t.exit_price.toFixed(2)}</td>
                        <td>{t.quantity}</td>
                        <td className={t.pnl >= 0 ? "text-success" : "text-danger"} style={{ fontWeight: 700 }}>
                          ₹{t.pnl.toFixed(2)}
                        </td>
                        <td className={t.pnl >= 0 ? "text-success" : "text-danger"} style={{ fontWeight: 700 }}>
                          {t.return_pct >= 0 ? "+" : ""}{t.return_pct.toFixed(2)}%
                        </td>
                        <td style={{ color: "#94a3b8" }}>{t.exit_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: "0.9rem", textAlign: "center", padding: "1.5rem" }}>
                No trades executed during the backtest timeframe. Try expanding the date range.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
