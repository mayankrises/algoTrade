"use client";

import { useEffect, useState } from "react";
import { Cpu, ArrowRight, Play, Info } from "lucide-react";
import Link from "next/link";

interface Strategy {
  id: string;
  name: string;
  description: string;
  entry_rule: string;
  exit_rule: string;
  risk_rule: string;
}

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStrategies = async () => {
      try {
        const res = await fetch("http://localhost:8000/strategies");
        if (!res.ok) {
          throw new Error("Failed to fetch strategies from API backend.");
        }
        const data = await res.json();
        setStrategies(data);
      } catch (err: any) {
        console.error(err);
        setError("Could not load strategies. Check backend connection.");
      } finally {
        setLoading(false);
      }
    };

    fetchStrategies();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", height: "100%", color: "#94a3b8" }}>
        <p style={{ fontSize: "1.1rem", fontWeight: 500 }}>Loading Strategy Catalog...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Title */}
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, color: "#f8fafc", marginBottom: "0.25rem" }}>Strategies</h1>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem" }}>Explore technical analysis rules and select algorithms to backtest or paper trade.</p>
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

      {/* Strategies Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "1.5rem"
      }}>
        {strategies.map((strategy) => (
          <div 
            key={strategy.id} 
            className="card"
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "1.5rem",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {/* Top segment */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
              }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#3b82f6"
                }}>
                  <Cpu size={20} />
                </div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc" }}>{strategy.name}</h3>
              </div>

              <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: "1.5" }}>
                {strategy.description}
              </p>
            </div>

            {/* Middle segment: Entry / Exit / Risk Rules */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.875rem",
              borderTop: "1px solid #202b3c",
              paddingTop: "1rem"
            }}>
              <div>
                <span style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                  Entry Signal
                </span>
                <p style={{ fontSize: "0.85rem", color: "#e2e8f0", marginTop: "0.125rem" }}>
                  {strategy.entry_rule}
                </p>
              </div>

              <div>
                <span style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                  Exit Signal
                </span>
                <p style={{ fontSize: "0.85rem", color: "#e2e8f0", marginTop: "0.125rem" }}>
                  {strategy.exit_rule}
                </p>
              </div>

              <div>
                <span style={{ fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em" }}>
                  Risk Parameters
                </span>
                <p style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.125rem" }}>
                  {strategy.risk_rule}
                </p>
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ display: "flex", gap: "0.75rem", width: "100%" }}>
              <Link 
                href={`/backtest?strategy=${strategy.id}`}
                className="btn btn-primary"
                style={{ flex: 1, padding: "0.5rem 1rem", fontSize: "0.8rem" }}
              >
                <Play size={14} />
                Backtest Strategy
              </Link>
              
              <Link 
                href={`/paper?strategy=${strategy.id}`}
                className="btn btn-secondary"
                style={{ flex: 1, padding: "0.5rem 1rem", fontSize: "0.8rem" }}
              >
                Launch Bot
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
