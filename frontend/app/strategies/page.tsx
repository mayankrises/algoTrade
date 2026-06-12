"use client";

import { useEffect, useState } from "react";
import { Cpu, ArrowRight, Play, Plus, X, Code2, ChevronDown, ChevronUp, Trash2, Upload, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "../config";

interface Strategy {
  id: string;
  name: string;
  description: string;
  entry_rule: string;
  exit_rule: string;
  risk_rule: string;
  is_custom?: boolean;
  created_at?: string;
}

const STRATEGY_TEMPLATE = `import pandas as pd
import numpy as np

def generate_signals(df: pd.DataFrame):
    df = df.copy()
    close = df['Close']

    # Example: MACD Crossover
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd = ema12 - ema26
    signal_line = macd.ewm(span=9, adjust=False).mean()

    df['signal'] = 0
    for i in range(1, len(df)):
        if macd.iloc[i-1] < signal_line.iloc[i-1] and macd.iloc[i] >= signal_line.iloc[i]:
            df.loc[df.index[i], 'signal'] = 1   # BUY
        elif macd.iloc[i-1] > signal_line.iloc[i-1] and macd.iloc[i] <= signal_line.iloc[i]:
            df.loc[df.index[i], 'signal'] = -1  # SELL
    return df


def run_backtest(df: pd.DataFrame, capital: float, ticker_name: str = "STOCK"):
    df_signals = generate_signals(df)
    close_col = 'Close'
    cash = capital
    position = None
    trades = []

    for idx, row in df_signals.iterrows():
        price = float(row[close_col])
        signal = int(row['signal'])
        time_str = idx.strftime('%Y-%m-%d %H:%M:%S') if hasattr(idx, 'strftime') else str(idx)

        if signal == 1 and position is None:
            quantity = int(cash // price)
            if quantity > 0:
                cash -= quantity * price
                position = {"entry_price": price, "quantity": quantity, "entry_time": time_str}

        elif signal == -1 and position is not None:
            revenue = position["quantity"] * price
            cash += revenue
            pnl = revenue - (position["quantity"] * position["entry_price"])
            return_pct = (price - position["entry_price"]) / position["entry_price"] * 100
            trades.append({
                "ticker": ticker_name,
                "strategy": "Custom Strategy",
                "mode": "backtest",
                "entry_time": position["entry_time"],
                "entry_price": float(position["entry_price"]),
                "exit_time": time_str,
                "exit_price": float(price),
                "quantity": float(position["quantity"]),
                "pnl": float(pnl),
                "return_pct": float(return_pct),
                "exit_reason": "Signal Exit"
            })
            position = None

    final_capital = cash
    total_trades = len(trades)
    win_rate = (len([t for t in trades if t["pnl"] > 0]) / total_trades * 100) if total_trades > 0 else 0.0
    profit_loss = final_capital - capital

    chart_data = []
    for idx, row in df_signals.iterrows():
        sig_val = int(row['signal'])
        chart_data.append({
            "time": idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx)[:10],
            "open": float(row.get('Open', row[close_col])),
            "high": float(row.get('High', row[close_col])),
            "low": float(row.get('Low', row[close_col])),
            "close": float(row[close_col]),
            "signal": "BUY" if sig_val == 1 else "SELL" if sig_val == -1 else None
        })

    return {
        "metrics": {
            "final_capital": float(final_capital),
            "profit_loss": float(profit_loss),
            "profit_loss_pct": float(profit_loss / capital * 100) if capital > 0 else 0.0,
            "total_trades": int(total_trades),
            "win_rate": float(win_rate),
            "max_drawdown": 0.0,
            "profit_factor": 1.0
        },
        "trades": trades,
        "chartData": chart_data
    }
`;

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload form state
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ name: "", display_name: "", description: "", code: STRATEGY_TEMPLATE });
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchStrategies = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/strategies`);
      if (!res.ok) throw new Error("Failed to fetch strategies from API backend.");
      const data = await res.json();
      setStrategies(data);
    } catch (err: any) {
      setError("Could not load strategies. Check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStrategies(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitStatus(null);

    // Validate slug
    if (!/^[a-z0-9_]+$/.test(form.name)) {
      setSubmitStatus({ type: "error", message: "Name must be lowercase letters, numbers, and underscores only (e.g. macd_cross)." });
      setSubmitting(false);
      return;
    }

    if (!form.code.includes("def run_backtest")) {
      setSubmitStatus({ type: "error", message: "Your code must define a run_backtest(df, capital, ticker_name) function." });
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/strategies/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, display_name: form.display_name, description: form.description, code: form.code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to upload strategy.");
      setSubmitStatus({ type: "success", message: `Strategy "${form.display_name}" ${data.status} successfully!` });
      setForm({ name: "", display_name: "", description: "", code: STRATEGY_TEMPLATE });
      await fetchStrategies();
      setTimeout(() => { setShowUpload(false); setSubmitStatus(null); }, 2000);
    } catch (err: any) {
      setSubmitStatus({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (strategyId: string) => {
    if (!confirm(`Delete strategy "${strategyId}"? This cannot be undone.`)) return;
    setDeleting(strategyId);
    try {
      const res = await fetch(`${API_BASE_URL}/strategies/custom/${strategyId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete strategy.");
      await fetchStrategies();
    } catch (err: any) {
      alert(`Error deleting strategy: ${err.message}`);
    } finally {
      setDeleting(null);
    }
  };

  const builtin = strategies.filter(s => !s.is_custom);
  const custom = strategies.filter(s => s.is_custom);

  if (loading) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>Loading Strategy Catalog...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.25rem" }}>Strategies</h1>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            Explore built-in algorithms or upload your own Python strategy to backtest and paper trade.
          </p>
        </div>
        <button
          id="upload-strategy-btn"
          onClick={() => { setShowUpload(!showUpload); setSubmitStatus(null); }}
          className="btn btn-primary"
          style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.25rem" }}
        >
          {showUpload ? <X size={16} /> : <Plus size={16} />}
          {showUpload ? "Cancel" : "Upload Strategy"}
        </button>
      </div>

      {error && (
        <div style={{
          backgroundColor: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)",
          color: "#ef4444", borderRadius: "8px", padding: "1rem", fontSize: "0.9rem", fontWeight: 500
        }}>⚠️ {error}</div>
      )}

      {/* Upload Form Panel */}
      {showUpload && (
        <div className="card" style={{ border: "1px solid rgba(99, 102, 241, 0.4)", boxShadow: "0 0 30px rgba(99, 102, 241, 0.1)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "8px",
              backgroundColor: "rgba(99, 102, 241, 0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#818cf8"
            }}>
              <Code2 size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>Upload Custom Strategy</h2>
              <p style={{ fontSize: "0.8rem", color: "#64748b" }}>Paste Python code that defines generate_signals() and run_backtest()</p>
            </div>
          </div>

          <form id="custom-strategy-form" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                  Strategy ID (slug) *
                </label>
                <input
                  id="strategy-name-input"
                  type="text"
                  required
                  placeholder="e.g. macd_cross"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") }))}
                  style={{
                    background: "rgba(15, 23, 42, 0.8)", border: "1px solid #1e293b", borderRadius: "8px",
                    padding: "0.6rem 0.875rem", color: "#f8fafc", fontSize: "0.9rem", fontFamily: "'Courier New', monospace", outline: "none"
                  }}
                />
                <p style={{ fontSize: "0.7rem", color: "#475569" }}>Lowercase, numbers & underscores only</p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                <label style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                  Display Name *
                </label>
                <input
                  id="strategy-display-name-input"
                  type="text"
                  required
                  placeholder="e.g. MACD Crossover"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  style={{
                    background: "rgba(15, 23, 42, 0.8)", border: "1px solid #1e293b", borderRadius: "8px",
                    padding: "0.6rem 0.875rem", color: "#f8fafc", fontSize: "0.9rem", outline: "none"
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                Description (optional)
              </label>
              <input
                id="strategy-description-input"
                type="text"
                placeholder="Brief description of how this strategy works..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                style={{
                  background: "rgba(15, 23, 42, 0.8)", border: "1px solid #1e293b", borderRadius: "8px",
                  padding: "0.6rem 0.875rem", color: "#f8fafc", fontSize: "0.9rem", outline: "none"
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                  Python Code *
                </label>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, code: STRATEGY_TEMPLATE }))}
                  style={{
                    fontSize: "0.7rem", color: "#818cf8", background: "rgba(99,102,241,0.08)",
                    border: "1px solid rgba(99,102,241,0.25)", borderRadius: "6px",
                    padding: "0.2rem 0.6rem", cursor: "pointer"
                  }}
                >
                  Load Template
                </button>
              </div>
              <textarea
                id="strategy-code-textarea"
                required
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                rows={20}
                spellCheck={false}
                style={{
                  background: "rgba(8, 14, 26, 0.9)", border: "1px solid #1e293b", borderRadius: "8px",
                  padding: "1rem", color: "#e2e8f0", fontSize: "0.8rem", fontFamily: "'Courier New', monospace",
                  lineHeight: "1.6", resize: "vertical", outline: "none", minHeight: "400px"
                }}
              />
              <div style={{
                padding: "0.75rem 1rem", background: "rgba(30, 41, 59, 0.5)", borderRadius: "6px",
                border: "1px solid rgba(30, 41, 59, 0.8)", fontSize: "0.78rem", color: "#64748b", lineHeight: "1.7"
              }}>
                <strong style={{ color: "#94a3b8" }}>Required interface:</strong><br />
                • <code style={{ color: "#818cf8" }}>generate_signals(df)</code> — adds a <code style={{ color: "#818cf8" }}>'signal'</code> column (1=BUY, -1=SELL, 0=HOLD)<br />
                • <code style={{ color: "#818cf8" }}>run_backtest(df, capital, ticker_name)</code> — returns <code style={{ color: "#818cf8" }}>{"{ metrics, trades, chartData }"}</code><br />
                • Available: <code style={{ color: "#818cf8" }}>pd</code> (pandas) and <code style={{ color: "#818cf8" }}>np</code> (numpy) are pre-imported
              </div>
            </div>

            {submitStatus && (
              <div style={{
                display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem",
                borderRadius: "8px", fontSize: "0.875rem", fontWeight: 500,
                backgroundColor: submitStatus.type === "success" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                border: `1px solid ${submitStatus.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                color: submitStatus.type === "success" ? "#22c55e" : "#ef4444"
              }}>
                {submitStatus.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                {submitStatus.message}
              </div>
            )}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowUpload(false)} className="btn btn-secondary" style={{ padding: "0.6rem 1.25rem" }}>
                Cancel
              </button>
              <button
                id="submit-strategy-btn"
                type="submit"
                disabled={submitting}
                className="btn btn-primary"
                style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.6rem 1.5rem", opacity: submitting ? 0.6 : 1 }}
              >
                <Upload size={16} />
                {submitting ? "Uploading..." : "Upload Strategy"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Built-in Strategies */}
      <div>
        <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>
          Built-in Strategies
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
          {builtin.map((strategy) => (
            <StrategyCard key={strategy.id} strategy={strategy} />
          ))}
        </div>
      </div>

      {/* Custom Strategies */}
      {custom.length > 0 && (
        <div>
          <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>
            Your Custom Strategies ({custom.length})
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem" }}>
            {custom.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onDelete={() => handleDelete(strategy.id)}
                deleting={deleting === strategy.id}
              />
            ))}
          </div>
        </div>
      )}

      {custom.length === 0 && !showUpload && (
        <div style={{
          border: "2px dashed #1e293b", borderRadius: "12px", padding: "2.5rem",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", color: "#475569"
        }}>
          <Code2 size={32} style={{ opacity: 0.5 }} />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontWeight: 600, color: "#64748b" }}>No custom strategies yet</p>
            <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Click <strong style={{ color: "#818cf8" }}>Upload Strategy</strong> to add your own Python algorithm.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function StrategyCard({ strategy, onDelete, deleting }: {
  strategy: Strategy;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        gap: "1.5rem", position: "relative", overflow: "hidden",
        border: strategy.is_custom ? "1px solid rgba(99, 102, 241, 0.25)" : undefined
      }}
    >
      {/* Custom badge */}
      {strategy.is_custom && (
        <div style={{
          position: "absolute", top: "1rem", right: "1rem",
          fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          background: "rgba(99, 102, 241, 0.15)", color: "#818cf8",
          border: "1px solid rgba(99, 102, 241, 0.3)", borderRadius: "4px", padding: "0.2rem 0.5rem"
        }}>
          Custom
        </div>
      )}

      {/* Top */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "8px",
            backgroundColor: strategy.is_custom ? "rgba(99, 102, 241, 0.1)" : "rgba(59, 130, 246, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: strategy.is_custom ? "#818cf8" : "#3b82f6"
          }}>
            {strategy.is_custom ? <Code2 size={20} /> : <Cpu size={20} />}
          </div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc", paddingRight: strategy.is_custom ? "4rem" : "0" }}>
            {strategy.name}
          </h3>
        </div>
        <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: "1.5" }}>
          {strategy.description || "Custom trading strategy."}
        </p>
      </div>

      {/* Rules */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", borderTop: "1px solid #202b3c", paddingTop: "1rem" }}>
        {[
          { label: "Entry Signal", value: strategy.entry_rule },
          { label: "Exit Signal", value: strategy.exit_rule },
          { label: "Risk Parameters", value: strategy.risk_rule },
        ].map(({ label, value }) => (
          <div key={label}>
            <span style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
              {label}
            </span>
            <p style={{ fontSize: "0.85rem", color: "#e2e8f0", marginTop: "0.125rem" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem", width: "100%" }}>
        <Link href={`/backtest?strategy=${strategy.id}`} className="btn btn-primary"
          style={{ flex: 1, padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
          <Play size={14} />
          Backtest
        </Link>
        <Link href={`/paper?strategy=${strategy.id}`} className="btn btn-secondary"
          style={{ flex: 1, padding: "0.5rem 1rem", fontSize: "0.8rem" }}>
          Launch Bot
          <ArrowRight size={14} />
        </Link>
        {strategy.is_custom && onDelete && (
          <button
            id={`delete-strategy-${strategy.id}`}
            onClick={onDelete}
            disabled={deleting}
            title="Delete this strategy"
            style={{
              width: "36px", height: "36px", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.3)",
              background: "rgba(239,68,68,0.08)", color: "#ef4444",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
              opacity: deleting ? 0.5 : 1, flexShrink: 0
            }}
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
