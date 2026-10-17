"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { State } from "@/lib/types";

export function useCommunitySync(
  communityId: string,
  selectedTopic: string,
  identity: string,
  accessible: boolean,
  onData: (state: State) => void,
) {
  const [online, setOnline] = useState(false);
  const [error, setError] = useState("");
  const reload = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => reload.current(), []);

  useEffect(() => {
    let stopped = false,
      tag = "",
      failures = 0,
      retries = 0;
    let running: Promise<void> | null = null;
    let controller: AbortController | null = null;
    let socket: WebSocket | null = null;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let change: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let lastStart = 0,
      lastPong = Date.now();
    const visible = () => !stopped && !document.hidden;
    const url = `/api/state?community=${encodeURIComponent(communityId)}${selectedTopic ? `&topic=${encodeURIComponent(selectedTopic)}` : ""}`;

    function load(force = false): Promise<void> {
      if (stopped) return Promise.resolve();
      if (running) return force ? running.then(() => load()) : running;
      lastStart = Date.now();
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15_000);
      running = (async () => {
        try {
          const response = await fetch(url, {
            cache: "no-store",
            signal: controller!.signal,
            headers: tag ? { "If-None-Match": tag } : {},
          });
          if (stopped) return;
          if (response.status !== 304) {
            const value = (await response.json()) as State & { error?: string };
            if (!response.ok)
              throw new Error(value.error || "连接失败，请重试");
            if (stopped) return;
            tag = response.headers.get("ETag") || "";
            onData(value);
          }
          failures = 0;
          setOnline(true);
          setError("");
        } catch (error) {
          if (!stopped) {
            failures++;
            setOnline(false);
            setError(
              error instanceof Error ? error.message : "连接失败，请重试",
            );
          }
        } finally {
          clearTimeout(timeout);
          running = null;
        }
      })();
      return running;
    }

    function schedulePoll() {
      clearTimeout(poll);
      if (!visible()) return;
      const base = socket?.readyState === WebSocket.OPEN ? 60_000 : 10_000;
      const delay = Math.min(120_000, base * 2 ** Math.min(failures, 4));
      poll = setTimeout(
        async () => {
          if (visible()) await load();
          schedulePoll();
        },
        delay * (0.9 + Math.random() * 0.2),
      );
    }

    function connect() {
      if (!visible() || !accessible || socket) return;
      clearTimeout(reconnect);
      const wsUrl = new URL(
        `/api/realtime?community=${encodeURIComponent(communityId)}`,
        location.href,
      );
      wsUrl.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(wsUrl);
      socket = ws;
      ws.onopen = () => {
        retries = 0;
        lastPong = Date.now();
        // Reconcile changes between the initial GET and the WebSocket handshake.
        void load(true);
        schedulePoll();
        heartbeat = setInterval(() => {
          if (Date.now() - lastPong > 70_000) ws.close();
          else if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 25_000);
      };
      ws.onmessage = (event) => {
        if (event.data === "pong") {
          lastPong = Date.now();
          return;
        }
        if (event.data !== "invalidate" || change || !visible()) return;
        change = setTimeout(
          () => {
            change = undefined;
            if (visible()) void load(true);
          },
          Math.max(250, lastStart + 2000 - Date.now()) + Math.random() * 500,
        );
      };
      ws.onclose = () => {
        if (socket !== ws) return;
        socket = null;
        clearInterval(heartbeat);
        schedulePoll();
        if (visible())
          reconnect = setTimeout(
            connect,
            Math.min(60_000, 1000 * 2 ** Math.min(retries++, 6)) *
              (0.8 + Math.random() * 0.4),
          );
      };
      ws.onerror = () => ws.close();
    }

    function activate() {
      if (!visible()) return;
      void load();
      connect();
      schedulePoll();
    }
    function pause() {
      clearTimeout(poll);
      clearTimeout(reconnect);
      clearTimeout(change);
      change = undefined;
      clearInterval(heartbeat);
      const ws = socket;
      socket = null;
      ws?.close();
    }
    const visibility = () => (document.hidden ? pause() : activate());
    reload.current = () => load(true);
    activate();
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", activate);
    window.addEventListener("focus", activate);
    return () => {
      stopped = true;
      pause();
      controller?.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", activate);
      window.removeEventListener("focus", activate);
    };
  }, [communityId, selectedTopic, identity, accessible, onData]);

  return { refresh, online, error };
}
