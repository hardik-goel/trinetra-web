"use client";
import React, { useEffect, useState } from "react";

/* ================================================================
   PWA plumbing: register the worker, offer updates, and tell each
   platform the truth about installing.

   iOS is the primary target and the fussiest: Safari alone can add to
   the home screen, so showing an "Install" button in iOS Chrome would
   be a button that cannot work. Each branch below says what that exact
   browser can actually do.
   ================================================================ */

const T = {
  card: "#1A1C13", line: "#2A2D1F", ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
const DISMISS_KEY = "trinetra.install.dismissed";

/** What this browser can do about installing. Exported for testing. */
export function installCapability(ua = navigator.userAgent, nav = navigator) {
  const standalone =
    (typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches) ||
    nav.standalone === true;
  if (standalone) return { kind: "installed" };

  // iPadOS 13+ reports as Macintosh; the touch points give it away.
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
  if (iOS) {
    // On iOS every browser is WebKit, so sniff the wrapper, not the engine.
    const nonSafari = /CriOS|FxiOS|EdgiOS|OPiOS|Brave/.test(ua);
    return nonSafari ? { kind: "ios-other" } : { kind: "ios-safari" };
  }

  const chromium = /Chrome|Chromium|Edg|SamsungBrowser/.test(ua) && !/OPR/.test(ua);
  return chromium ? { kind: "prompt" } : { kind: "generic" };
}

export default function Pwa() {
  const [cap, setCap] = useState(null);
  const [deferred, setDeferred] = useState(null);
  const [waiting, setWaiting] = useState(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setCap(installCapability());
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { setDismissed(false); }

    if (!("serviceWorker" in navigator)) return;
    // Hand the worker the data origins so it bypasses them even if they are
    // ever proxied onto this origin.
    const bypass = [process.env.NEXT_PUBLIC_BACKEND_URL, process.env.NEXT_PUBLIC_PRAVESH_DATA_URL]
      .filter(Boolean).map(u => { try { return new URL(u).origin; } catch { return null; } }).filter(Boolean);
    const qs = bypass.map(o => `bypass=${encodeURIComponent(o)}`).join("&");

    let reg;
    navigator.serviceWorker.register(`/sw.js${qs ? "?" + qs : ""}`).then(r => {
      reg = r;
      if (r.waiting) setWaiting(r.waiting);
      r.addEventListener("updatefound", () => {
        const sw = r.installing;
        sw?.addEventListener("statechange", () => {
          // Only an update if something was already controlling the page.
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    }).catch(() => { /* no worker: the app still works, it just is not installable */ });

    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => { setDeferred(null); setCap({ kind: "installed" }); };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => { setDismissed(true); try { localStorage.setItem(DISMISS_KEY, "1"); } catch {} };

  const box = {
    position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 60, maxWidth: 460, margin: "0 auto",
    background: T.card, border: "1px solid " + T.brass + "44", borderRadius: 12,
    padding: "12px 14px", fontFamily: T.sans, color: T.ink,
    boxShadow: "0 10px 30px #0009",
    paddingBottom: "calc(12px + env(safe-area-inset-bottom))",
  };
  const btn = (primary) => ({
    padding: "7px 12px", borderRadius: 7, border: "1px solid " + (primary ? T.brass : T.line),
    background: primary ? T.brass : "transparent", color: primary ? "#141206" : T.mute,
    fontSize: 11.5, fontWeight: primary ? 600 : 400, cursor: "pointer",
  });

  /* The update toast outranks the install hint: a stale bundle is a
     correctness problem, an uninstalled app is only an inconvenience. */
  if (waiting) {
    return (
      <div style={box} role="status">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5 }}>New version available.</span>
          <span style={{ fontSize: 11, color: T.dimSolid, flex: 1 }}>Reload when you are not mid-decision.</span>
          <button style={btn(true)} onClick={() => {
            waiting.postMessage("SKIP_WAITING");
            navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
          }}>Reload</button>
          <button style={btn()} onClick={() => setWaiting(null)}>Later</button>
        </div>
      </div>
    );
  }

  if (!cap || dismissed || cap.kind === "installed") return null;

  const content = {
    prompt: {
      line: "Install Trinetra to your home screen — it opens fullscreen, like an app.",
      action: deferred && (
        <button style={btn(true)} onClick={async () => {
          deferred.prompt();
          await deferred.userChoice.catch(() => {});
          setDeferred(null); dismiss();
        }}>Install</button>
      ),
    },
    "ios-safari": {
      line: <>Add Trinetra to your home screen: tap <strong style={{ color: T.brass }}>Share</strong> then <strong style={{ color: T.brass }}>Add to Home Screen</strong>.</>,
    },
    // The honest branch: this browser physically cannot do it.
    "ios-other": {
      line: <>To install Trinetra on iPhone, open this page in <strong style={{ color: T.brass }}>Safari</strong>, then tap Share → Add to Home Screen. Apple only allows Safari to add apps to the home screen.</>,
    },
    generic: { line: "Add this page to your home screen from your browser menu to open Trinetra like an app." },
  }[cap.kind];

  if (!content) return null;
  // Chromium before the browser has fired beforeinstallprompt: stay quiet
  // rather than show a button that does nothing.
  if (cap.kind === "prompt" && !deferred) return null;

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <img src="/icons/icon-192.png" alt="" width={32} height={32} style={{ borderRadius: 7, flexShrink: 0 }} />
        <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.55, color: T.mute }}>{content.line}</div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
        {content.action}
        <button style={btn()} onClick={dismiss}>Not now</button>
      </div>
    </div>
  );
}
