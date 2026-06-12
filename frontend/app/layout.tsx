"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  TrendingUp, 
  Cpu, 
  PlayCircle, 
  History, 
  Wifi, 
  WifiOff 
} from "lucide-react";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);

  // Periodic API health checking
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch("http://localhost:8000/health");
        if (res.ok) {
          setApiConnected(true);
        } else {
          setApiConnected(false);
        }
      } catch (err) {
        setApiConnected(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Backtest", path: "/backtest", icon: TrendingUp },
    { name: "Strategies", path: "/strategies", icon: Cpu },
    { name: "Paper Trading", path: "/paper", icon: PlayCircle },
    { name: "Trade Log", path: "/trades", icon: History },
  ];

  return (
    <html lang="en">
      <body style={{ display: "flex", flexDirection: "row", height: "100vh", overflow: "hidden" }}>
        {/* Navigation Sidebar */}
        <aside style={{
          width: "260px",
          backgroundColor: "#0f141c",
          borderRight: "1px solid #202b3c",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "1.5rem",
          flexShrink: 0
        }}>
          <div>
            {/* Branding Logo */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "2rem",
              padding: "0 0.5rem"
            }}>
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                backgroundColor: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                color: "#ffffff"
              }}>
                Ω
              </div>
              <span style={{
                fontWeight: 800,
                fontSize: "1.125rem",
                letterSpacing: "0.05em",
                color: "#f8fafc",
                background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent"
              }}>
                ANTIGRAVITY
              </span>
            </div>

            {/* Navigation links */}
            <nav style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {navItems.map((item) => {
                const isActive = pathname === item.path || (pathname === "/" && item.path === "/dashboard");
                const IconComponent = item.icon;

                return (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.75rem 1rem",
                      borderRadius: "8px",
                      color: isActive ? "#ffffff" : "#94a3b8",
                      backgroundColor: isActive ? "#202b3c" : "transparent",
                      fontWeight: isActive ? 600 : 500,
                      fontSize: "0.9rem",
                      transition: "all 0.15s ease-in-out"
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = "rgba(32, 43, 60, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <IconComponent size={18} style={{ color: isActive ? "#3b82f6" : "#64748b" }} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Connection Status Footnote */}
          <div style={{
            borderTop: "1px solid #202b3c",
            paddingTop: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "0.75rem"
          }}>
            <span style={{ color: "#64748b" }}>Backend Status:</span>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "0.375rem",
              color: apiConnected === true ? "#10b981" : apiConnected === false ? "#ef4444" : "#f59e0b"
            }}>
              {apiConnected === true ? (
                <>
                  <Wifi size={14} />
                  <span>Online</span>
                </>
              ) : apiConnected === false ? (
                <>
                  <WifiOff size={14} />
                  <span>Offline</span>
                </>
              ) : (
                <span>Checking...</span>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main style={{
          flexGrow: 1,
          height: "100%",
          overflowY: "auto",
          backgroundColor: "#080b11"
        }}>
          {children}
        </main>
      </body>
    </html>
  );
}
