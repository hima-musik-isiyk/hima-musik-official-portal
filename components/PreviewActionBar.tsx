"use client";

import { useEffect, useState } from "react";

import {
  IconAlertTriangle,
  IconCheckCircle,
  IconLoader,
  IconRefreshCw,
} from "./Icons";

export default function PreviewActionBar() {
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "syncing" | "success" | "cooldown"
  >("idle");
  const [cooldownTime, setCooldownTime] = useState(0);
  const [message, setMessage] = useState(
    "Tinjauan Internal KKM / Pengurus HIMA",
  );

  const handleSync = async () => {
    if (syncStatus === "syncing" || syncStatus === "cooldown") return;

    setSyncStatus("syncing");
    setMessage("Sedang menyinkronkan data dengan Notion...");

    try {
      const res = await fetch("/api/notion/revalidate", { method: "POST" });
      const data = await res.json();

      if (data.ok && data.status === "success") {
        setSyncStatus("success");
        setMessage("Sinkronisasi berhasil! Memuat ulang halaman...");

        // Reload page after a brief delay to show fresh data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else if (data.ok && data.status === "cooldown") {
        setSyncStatus("cooldown");
        setCooldownTime(data.secondsLeft || 10);
        setMessage(`Sinkronisasi baru saja dilakukan. Tunggu sebentar...`);
      } else {
        throw new Error(data.error || "Gagal menyinkronkan");
      }
    } catch (err) {
      console.error(err);
      setSyncStatus("idle");
      setMessage("Gagal menyinkronkan. Silakan coba lagi.");
    }
  };

  useEffect(() => {
    if (syncStatus !== "cooldown" || cooldownTime <= 0) {
      if (syncStatus === "cooldown") {
        setSyncStatus("idle");
        setMessage("Tinjauan Internal KKM / Pengurus HIMA");
      }
      return;
    }

    const timer = setTimeout(() => {
      setCooldownTime((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [syncStatus, cooldownTime]);

  return (
    <div className="border-gold-500/20 sticky top-0 z-50 border-b bg-black/85 px-4 py-3 text-center backdrop-blur-md transition-all duration-300">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
        {/* Status Message */}
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
          {syncStatus === "success" ? (
            <IconCheckCircle className="h-4 w-4 animate-bounce text-green-400" />
          ) : syncStatus === "syncing" ? (
            <IconLoader className="text-gold-400 h-4 w-4 animate-spin" />
          ) : (
            <IconAlertTriangle className="text-gold-400 h-4 w-4" />
          )}
          <span
            className={
              syncStatus === "success" ? "text-green-400" : "text-gold-300"
            }
          >
            {message}
          </span>
        </div>

        {/* Sync Button */}
        <button
          onClick={handleSync}
          disabled={syncStatus === "syncing" || syncStatus === "cooldown"}
          className={`flex items-center gap-2 rounded-full px-5 py-1.5 text-xs font-bold tracking-[0.1em] uppercase transition-all duration-300 ${
            syncStatus === "syncing"
              ? "bg-gold-500/10 text-gold-400 border-gold-500/20 cursor-wait border"
              : syncStatus === "cooldown"
                ? "cursor-not-allowed border border-white/10 bg-white/5 text-white/40"
                : "bg-gold-500 hover:bg-gold-400 cursor-pointer text-black hover:shadow-[0_0_15px_rgba(212,166,77,0.4)]"
          }`}
        >
          {syncStatus === "syncing" ? (
            <>
              <IconLoader className="h-3.5 w-3.5 animate-spin" />
              Menyinkronkan...
            </>
          ) : syncStatus === "cooldown" ? (
            <>
              <IconRefreshCw className="h-3.5 w-3.5 opacity-45" />
              Tunggu {cooldownTime}s
            </>
          ) : (
            <>
              <IconRefreshCw className="h-3.5 w-3.5 transition-transform duration-500 group-hover:rotate-180" />
              Sinkronkan ke Website Publik
            </>
          )}
        </button>
      </div>
    </div>
  );
}
