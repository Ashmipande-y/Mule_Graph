"use client";

import React from "react";
import type { ConnectionStatus } from "@/types/event";
import { WifiOff, RefreshCw } from "lucide-react";

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  lastUpdated: string | null;
  onReconnect?: () => void;
  className?: string;
}

export const ConnectionStatusBadge: React.FC<ConnectionStatusBadgeProps> = ({
  status,
  lastUpdated,
  onReconnect,
  className = "",
}) => {
  const formatTime = (isoString: string | null) => {
    if (!isoString) return "Never";
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    } catch {
      return isoString;
    }
  };

  if (status === "connected") {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 ${className}`}
        title={`Live updates connected. Last update: ${formatTime(lastUpdated)}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <span className="font-mono">LIVE UPDATES</span>
        {lastUpdated && (
          <span className="text-[10px] text-muted-foreground opacity-75">
            {formatTime(lastUpdated)}
          </span>
        )}
      </div>
    );
  }

  if (status === "reconnecting") {
    return (
      <div
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ${className}`}
      >
        <RefreshCw className="h-3 w-3 animate-spin" />
        <span className="font-mono">RECONNECTING...</span>
      </div>
    );
  }

  // Disconnected / Offline Mode
  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 ${className}`}
      title="Offline mode: showing cached state"
    >
      <WifiOff className="h-3 w-3" />
      <span className="font-mono">OFFLINE</span>
      {lastUpdated && (
        <span className="text-[10px] text-muted-foreground">
          Cached ({formatTime(lastUpdated)})
        </span>
      )}
      {onReconnect && (
        <button
          onClick={onReconnect}
          className="ml-1 px-1.5 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 text-[10px] transition-colors"
        >
          Reconnect
        </button>
      )}
    </div>
  );
};
