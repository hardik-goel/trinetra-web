"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deskApi, rupee } from "../lib/desk";
import { DecisionStrip } from "./Decision";

/* The detail-drawer surface: what this setup is estimated to be worth, and
   what a position in it would cost. /decision answers even when the profile
   has not locked — "what would this be worth" deserves an answer before it
   fires, not after. */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", line: "#2A2D1F", ink: "#EAE7DB", mute: "#9C9F8B",
  dimSolid: "#636653", brass: "#C9A961", green: "#86C08A", red: "#DC6A58", amber: "#D8B25C",
  mono: "'IBM Plex Mono', ui-monospace, monospace", sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
const inS = { background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px" };
const Label = ({ children }) => (
  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: T.brass, margin: "16px 0 8px", textTransform: "uppercase" }}>{children}</div>
);

export default function StockDecision({ backendUrl, symbol, profileId, price }) {
  const api = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);
  const [decision, setDecision] = useState(null);
  const [err, setErr] = useState("");
  const [entry, setEntry] = useState(price != null ? String(price) : "");
  const [stop, setStop] = useState("");
  const [size, setSize] = useState(null);
  const [sizeErr, setSizeErr] = useState("");

  const profile = profileId && profileId !== "ALL" ? profileId : "swing";

  useEffect(() => {
    if (!api || !symbol) return;
    let dead = false;
    api.decision({ symbol, profile })
      .then(d => { if (!dead) { setDecision(d); setErr(""); } })
      .catch(e => { if (!dead) { setDecision(null); setErr(e.message || "no decision available"); } });
    return () => { dead = true; };
  }, [api, symbol, profile]);

  const calc = useCallback(async () => {
    setSizeErr(""); setSize(null);
    try { setSize(await api.sizeFor({ symbol, entry: +entry || undefined, stop: +stop || undefined })); }
    catch (e) { setSizeErr(e.message || "could not size"); }
  }, [api, symbol, entry, stop]);

  return (
    <div style={{ fontFamily: T.sans }}>
      <Label>Decision · {profile}</Label>
      {decision
        ? <DecisionStrip signal={decision} currentPrice={price} inline />
        : <div style={{ fontSize: 11.5, color: T.dimSolid, lineHeight: 1.55 }}>
            {err ? `No estimate from the backend for this symbol — ${err}` : "Reading the estimate…"}
          </div>}

      <Label>Position sizing</Label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <input value={entry} onChange={e => setEntry(e.target.value)} type="number" step="any" placeholder="Entry ₹" style={{ ...inS, width: 100 }} />
        <input value={stop} onChange={e => setStop(e.target.value)} type="number" step="any" placeholder="Stop ₹" style={{ ...inS, width: 100 }} />
        <button onClick={calc} style={{ padding: "6px 11px", borderRadius: 7, border: "1px solid " + T.brass, background: T.brass, color: "#141206", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
          Size it
        </button>
      </div>
      {sizeErr && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 7, lineHeight: 1.5 }}>{sizeErr}</div>}
      {size && !size.error && (
        <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px", marginTop: 8 }}>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontFamily: T.mono, fontSize: 11.5, color: T.ink }}>
            <span>{size.qty} shares</span>
            <span style={{ color: T.red }}>risk {rupee(size.rupeeRisk)}</span>
            <span style={{ color: T.mute }}>{rupee(size.positionValue)} position</span>
            <span style={{ color: T.mute }}>{size.positionPctOfCapital != null ? `${size.positionPctOfCapital.toFixed(1)}% of capital` : ""}</span>
          </div>
          {/* An invented stop produces an invented quantity — say which it was. */}
          {size.stopAssumed && (
            <div style={{ fontSize: 11, color: T.amber, marginTop: 6, lineHeight: 1.5 }}>
              ⚠ No stop given, so a default was assumed — the quantity follows from a level you did not choose.
            </div>
          )}
          {(size.notes || []).map(n => (
            <div key={n} style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 4, lineHeight: 1.5 }}>· {n}</div>
          ))}
        </div>
      )}
      {size?.error && <div style={{ fontSize: 11.5, color: T.amber, marginTop: 7 }}>{size.error} — set capital in Positions → Capital &amp; risk.</div>}
    </div>
  );
}
