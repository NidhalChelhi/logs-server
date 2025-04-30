"use client";
import { useEffect, useState, useRef } from "react";

type LogSeverity = "error" | "warning" | "info" | "debug";

interface LogEntry {
  id: number;
  host: string;
  message: string;
  timestamp: number;
  time: string;
  date: string;
  severity: LogSeverity;
}

interface LogStats {
  total_logs: number;
  error_logs: number;
  warning_logs: number;
  unique_hosts: number;
}

const SEVERITY_COLORS = {
  error: {
    border: "border-red-500",
    bg: "bg-red-500",
    text: "text-red-500",
    hover: "hover:bg-red-900/20",
  },
  warning: {
    border: "border-yellow-500",
    bg: "bg-yellow-500",
    text: "text-yellow-500",
    hover: "hover:bg-yellow-900/20",
  },
  info: {
    border: "border-blue-500",
    bg: "bg-blue-500",
    text: "text-blue-500",
    hover: "hover:bg-blue-900/20",
  },
  debug: {
    border: "border-gray-500",
    bg: "bg-gray-500",
    text: "text-gray-500",
    hover: "hover:bg-gray-900/20",
  },
};

const HOST_COLORS = [
  "bg-teal-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-pink-500",
  "bg-yellow-500",
  "bg-red-500",
  "bg-purple-500",
];

const SEVERITY_ICONS = {
  error: "❗",
  warning: "⚠️",
  info: "ℹ️",
  debug: "🐛",
};

export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterHost, setFilterHost] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState<LogSeverity | "all">(
    "all"
  );
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [serverUrl, setServerUrl] = useState("");
  const [stats, setStats] = useState<LogStats | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const hostColorMap = useRef<Map<string, string>>(new Map());
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Initialize server URL
  useEffect(() => {
    const url =
      process.env.NEXT_PUBLIC_LOG_SERVER_URL || "http://localhost:8000";
    setServerUrl(url);
  }, []);

  // Fetch stats periodically
  useEffect(() => {
    if (!serverUrl) return;

    const fetchStats = async () => {
      try {
        const response = await fetch(`${serverUrl}/log-stats`);
        const data = await response.json();
        setStats(data);
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [serverUrl]);

  // SSE connection
  useEffect(() => {
    if (!serverUrl) return;

    const eventSource = new EventSource(`${serverUrl}/stream-logs`);

    eventSource.onopen = () => setConnectionStatus("connected");

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const log: LogEntry = {
          ...data,
          id: Date.now() + Math.random(),
          time: new Date(data.timestamp * 1000).toLocaleTimeString(),
          date: new Date(data.timestamp * 1000).toLocaleDateString(),
          severity: data.severity || "info",
        };

        setLogs((prev) => [...prev, log].slice(-500)); // Keep last 500 logs
      } catch (error) {
        console.error("Error parsing log:", error);
      }
    };

    eventSource.onerror = () => {
      setConnectionStatus("disconnected");
      eventSource.close();
    };

    return () => eventSource.close();
  }, [serverUrl]);

  // Auto-scroll to bottom for new logs
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Get unique hosts
  const hosts = Array.from(new Set(logs.map((log) => log.host))).sort();

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.message
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesHost = filterHost === "all" || log.host === filterHost;
    const matchesSeverity =
      filterSeverity === "all" || log.severity === filterSeverity;
    return matchesSearch && matchesHost && matchesSeverity;
  });

  // Statistics
  const currentStats = {
    total: logs.length,
    errors: logs.filter((log) => log.severity === "error").length,
    warnings: logs.filter((log) => log.severity === "warning").length,
    hosts: new Set(logs.map((log) => log.host)).size,
  };

  const getHostColor = (host: string) => {
    if (!hostColorMap.current.has(host)) {
      const colorIndex = hostColorMap.current.size % HOST_COLORS.length;
      hostColorMap.current.set(host, HOST_COLORS[colorIndex]);
    }
    return hostColorMap.current.get(host) || "bg-gray-600";
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-blue-400 mb-2">
            Centralized Log Monitoring
          </h1>
          <p className="text-gray-400">
            Made by: Mohamed Ghaith Hamzaoui & Nidhal Chelhi
          </p>
        </header>

        {/* Statistics Dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Logs"
            value={stats?.total_logs || currentStats.total}
            trend="neutral"
            icon="📊"
          />
          <StatCard
            title="Errors"
            value={stats?.error_logs || currentStats.errors}
            trend={currentStats.errors > 0 ? "up" : "neutral"}
            icon="❗"
            className="bg-red-900/50"
          />
          <StatCard
            title="Warnings"
            value={stats?.warning_logs || currentStats.warnings}
            trend={currentStats.warnings > 0 ? "up" : "neutral"}
            icon="⚠️"
            className="bg-yellow-900/50"
          />
          <StatCard
            title="Active Hosts"
            value={stats?.unique_hosts || currentStats.hosts}
            trend="neutral"
            icon="🖥️"
            className="bg-blue-900/50"
          />
        </div>

        {/* Controls */}
        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden mb-6">
          <div className="p-6 bg-gray-800/50 border-b border-gray-700">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-2 text-gray-300">
                  Search Logs
                </label>
                <input
                  type="text"
                  placeholder="Filter logs by content..."
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 font-mono"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="w-full md:w-48">
                <label className="block text-sm font-medium mb-2 text-gray-300">
                  Filter by Host
                </label>
                <select
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filterHost}
                  onChange={(e) => setFilterHost(e.target.value)}
                >
                  <option value="all">All Hosts</option>
                  {hosts.map((host) => (
                    <option key={host} value={host}>
                      {host}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-full md:w-48">
                <label className="block text-sm font-medium mb-2 text-gray-300">
                  Filter by Severity
                </label>
                <select
                  className="w-full px-4 py-2 bg-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filterSeverity}
                  onChange={(e) =>
                    setFilterSeverity(e.target.value as LogSeverity | "all")
                  }
                >
                  <option value="all">All Severities</option>
                  <option value="error">Errors</option>
                  <option value="warning">Warnings</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
            </div>
          </div>

          <div
            ref={logsContainerRef}
            className="relative h-[70vh] overflow-y-auto bg-gray-900/50"
          >
            {filteredLogs.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                {logs.length === 0 ? (
                  <div className="text-center">
                    <div className="animate-pulse mb-2">
                      <svg
                        className="w-12 h-12 mx-auto text-gray-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <p>
                      {connectionStatus === "connected"
                        ? "Waiting for logs..."
                        : "Connecting to log server..."}
                    </p>
                  </div>
                ) : (
                  <p>No logs match your filters</p>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {filteredLogs.map((log) => {
                  const severityColor = SEVERITY_COLORS[log.severity];
                  const hostColor = getHostColor(log.host);

                  return (
                    <div
                      key={`${log.id}-${log.timestamp}`}
                      className={`p-4 rounded-lg bg-gray-800/70 ${severityColor.hover} transition-colors duration-150 border-l-4 ${severityColor.border}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`${hostColor} text-xs font-bold px-2 py-1 rounded`}
                          >
                            {log.host.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-400">
                            {log.date} • {log.time}
                          </span>
                          <span className={`text-xs ${severityColor.text}`}>
                            {SEVERITY_ICONS[log.severity]}{" "}
                            {log.severity.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className="font-mono text-sm break-words mt-2 text-gray-200">
                        {log.message}
                      </div>
                    </div>
                  );
                })}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>

        <footer className="text-center text-gray-500 text-sm">
          <p>
            {serverUrl
              ? `Connected to: ${serverUrl}`
              : "Configuring connection..."}{" "}
            • Showing {filteredLogs.length} of {logs.length} logs •{" "}
            <span
              className={
                connectionStatus === "connected"
                  ? "text-green-400"
                  : "text-red-400"
              }
            >
              {connectionStatus.toUpperCase()}
            </span>
          </p>
        </footer>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  trend,
  icon,
  className = "",
}: {
  title: string;
  value: number;
  trend: "up" | "down" | "neutral";
  icon: string;
  className?: string;
}) {
  const trendColor = {
    up: "text-red-400",
    down: "text-green-400",
    neutral: "text-gray-400",
  }[trend];

  const trendIcon = {
    up: "↑",
    down: "↓",
    neutral: "→",
  }[trend];

  return (
    <div className={`p-4 rounded-lg bg-gray-800/50 ${className}`}>
      <div className="flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-400">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{icon}</span>
          {trend !== "neutral" && (
            <span className={`text-sm ${trendColor}`}>{trendIcon}</span>
          )}
        </div>
      </div>
    </div>
  );
}
