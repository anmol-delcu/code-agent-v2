"use client";

import { useEffect, useRef, useState } from "react";
import { getContainers } from "../../../lib/backend/api";
import { fetchWithAuth } from "../../../lib/fetchWithAuth";
import type { Container } from "../../../lib/backend/api";

interface LivePreviewProps {
  containerId: string;
  isDesktopView?: boolean;
  refreshTrigger?: number;
}

export const LivePreview = ({
  containerId,
  isDesktopView = true,
  refreshTrigger = 0,
}: LivePreviewProps) => {
  const [container, setContainer] = useState<Container | null>(null);
  const [isLoadingContainer, setIsLoadingContainer] = useState(true);
  // Restore readiness from session so returning users skip the brewing screen
  const [isReady, setIsReady] = useState(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(`preview-ready-${containerId}`) === "1";
  });
  const [iframeKey, setIframeKey] = useState(0);
  const [dots, setDots] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dotsRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTriggerRef = useRef(refreshTrigger);

  // Animate dots
  useEffect(() => {
    dotsRef.current = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 500);
    return () => {
      if (dotsRef.current) clearInterval(dotsRef.current);
    };
  }, []);

  // Reload iframe when AI finishes writing code
  useEffect(() => {
    if (refreshTrigger !== prevTriggerRef.current) {
      prevTriggerRef.current = refreshTrigger;
      if (isReady) {
        // Small delay so the file write completes before reload
        setTimeout(() => setIframeKey((k) => k + 1), 1500);
      } else {
        // App wasn't ready yet — re-check readiness
        setIsReady(false);
      }
    }
  }, [refreshTrigger, isReady]);

  // Fetch container info
  useEffect(() => {
    const fetchContainer = async () => {
      try {
        const containers = await getContainers();
        const found = containers.find((c) => c.id === containerId);
        setContainer(found ?? null);
      } catch {
        setContainer(null);
      } finally {
        setIsLoadingContainer(false);
      }
    };

    fetchContainer();
    const interval = setInterval(fetchContainer, 5000);
    return () => clearInterval(interval);
  }, [containerId]);

  // Poll /ready once container is running
  useEffect(() => {
    if (!container || container.status !== "running" || !container.url) {
      setIsReady(false);
      sessionStorage.removeItem(`preview-ready-${containerId}`);
      return;
    }

    if (isReady) return;

    const checkReady = async () => {
      try {
        const res = await fetchWithAuth(`/api/containers/${containerId}/ready`);
        const data = await res.json();
        if (data.ready) {
          setIsReady(true);
          sessionStorage.setItem(`preview-ready-${containerId}`, "1");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {}
    };

    checkReady();
    pollRef.current = setInterval(checkReady, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [container, containerId, isReady]);

  // Loading container info
  if (isLoadingContainer) {
    return (
      <PreviewShell>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-400/60 border-t-blue-400 rounded-full animate-spin" />
          <span className="text-white/50 text-sm">Loading preview{dots}</span>
        </div>
      </PreviewShell>
    );
  }

  // Container not found or not running
  if (!container || container.status !== "running" || !container.url) {
    return (
      <PreviewShell>
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
            </svg>
          </div>
          <p className="text-zinc-400 text-sm">Container not running</p>
        </div>
      </PreviewShell>
    );
  }

  // Container running but app not ready yet
  if (!isReady) {
    return (
      <PreviewShell>
        <div className="text-center space-y-6 max-w-xs">
          {/* Brewing animation */}
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-violet-500/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-2 border-violet-500/40 animate-ping [animation-delay:0.3s]" />
            <div className="relative w-16 h-16 rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center">
              <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
            </div>
          </div>

          <div>
            <p className="text-white/80 text-sm font-medium">Brewing your app{dots}</p>
            <p className="text-zinc-500 text-xs mt-1">Starting Next.js dev server</p>
          </div>

          {/* Progress bar */}
          <div className="w-48 mx-auto h-1 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full animate-[loading_2s_ease-in-out_infinite]" style={{ width: "60%" }} />
          </div>

          <p className="text-zinc-600 text-xs">First load takes ~30 seconds</p>
        </div>
      </PreviewShell>
    );
  }

  // App is ready — show iframe
  const iframe = (
    <iframe
      key={`${container.url}-${iframeKey}`}
      src={container.url}
      className="w-full h-full border-0"
      title={`Preview of ${container.name || container.id}`}
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    />
  );

  if (!isDesktopView) {
    return (
      <div className="w-full h-full bg-zinc-900/20 flex items-center justify-center p-6">
        <div
          className="bg-gray-800 rounded-[2.5rem] p-3 shadow-2xl border border-gray-700/50 relative"
          style={{ width: "320px", height: "680px", maxHeight: "calc(100vh - 140px)" }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-gray-600/10 via-transparent to-gray-700/10 rounded-[2.5rem]" />
          <div className="w-full h-full rounded-[1.8rem] overflow-hidden relative z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-gray-800 rounded-b-2xl z-10" />
            {iframe}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white rounded-lg border border-zinc-300/20 overflow-hidden shadow-2xl">
      <div className="bg-zinc-100/20 backdrop-blur-sm border-b border-zinc-300/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-red-500 rounded-full" />
          <div className="w-3 h-3 bg-yellow-500 rounded-full" />
          <div className="w-3 h-3 bg-green-500 rounded-full" />
        </div>
        <div className="text-sm text-zinc-600 font-mono bg-white/80 px-3 py-1 rounded border border-zinc-300/30">
          {container.url}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-zinc-600 font-medium">Live</span>
        </div>
      </div>
      <div className="w-full" style={{ height: "calc(100% - 49px)" }}>
        {iframe}
      </div>
    </div>
  );
};

function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full bg-zinc-950 rounded-lg border border-zinc-800 flex items-center justify-center">
      {children}
    </div>
  );
}
