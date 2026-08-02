"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deskApi, pctText, rupee, SEVERITY_ORDER } from "../lib/desk";
import { DecisionStrip } from "./Decision";

/* ================================================================
   MORNING BRIEF — one screen, ordered by what needs deciding soonest.

   The server assembles it; this file renders it and does not reorder
   it. Exits come first because that money is already committed. The
   data-health line is not a footnote: a brief read at 09:20 off a
   snapshot from yesterday is worse than no brief.
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C", blue: "#7FA6CE",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
const SEV = { high: T.red, medium: T.amber, low: T.blue };
const Label = ({ children, accent, count }) => (
  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 9, marginTop: 18 }}>
    <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: accent || T.brass, textTransform: "uppercase" }}>{children}</span>
    {count != null && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>{count}</span>}
  </div>
);
const Quiet = ({ children }) => (
  <div style={{ border: "1px dashed " + T.line, borderRadius: 10, padding: "13px 14px", fontSize: 12, color: T.dimSolid, lineHeight: 1.55 }}>{children}</div>
);

/* The line that stops a stale brief passing for a live one. */
function DataHealth({ h }) {
  if (!h) return null;
  const stale = (h.ageSeconds ?? 0) > 900;
  const missing = (h.expected ?? 0) - (h.symbols ?? 0);
  return (
    <div style={{ fontFamily: T.mono, fontSize: 10, color: stale ? T.amber : T.dimSolid, lineHeight: 1.7, marginTop: 4 }}>
      {h.provider} · {h.delayed ? `delayed ~${Math.round((h.lagSeconds || 0) / 60)}m` : "live"} ·
      {" "}refreshed {h.ageSeconds != null ? `${h.ageSeconds}s ago` : "—"} · {h.symbols ?? "—"} symbols
      {missing > 0 ? ` · ${missing} missing` : ""}
      {h.failures?.length ? ` · failing: ${h.failures.join(", ")}` : ""}
      {stale ? " · this brief is not current" : ""}
    </div>
  );
}

function SignalCard({ sig, onHold, held, busy }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "11px 13px", marginBottom: 7 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: 13, color: T.ink }}>{sig.symbol}</span>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.brass }}>{sig.count}/{sig.total} · {sig.profileName || sig.profileId}</span>
        {sig.confidence && (
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>
            confidence {sig.confidence.score} {sig.confidence.band}
          </span>
        )}
        <button onClick={() => setOpen(o => !o)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.dimSolid, fontFamily: T.mono, fontSize: 9.5, cursor: "pointer" }}>
          {open ? "less ▴" : "detail ▾"}
        </button>
      </div>

      {sig.eventWarning && (
        <div style={{ fontSize: 11.5, color: T.amber, marginTop: 6, lineHeight: 1.5 }}>⚠ {sig.eventWarning}</div>
      )}

      {open
        ? <div style={{ marginTop: 10 }}><DecisionStrip signal={sig} currentPrice={sig.price} /></div>
        : sig.potential && !sig.potential.insufficientHistory && (
            <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.mute, marginTop: 6 }}>
              moved {pctText(sig.potential.movedAlreadyPct)} · est. {pctText(sig.potential.remainingPct?.low)}–{pctText(sig.potential.remainingPct?.high, false)} remaining
              <span style={{ color: T.dimSolid }}> n={sig.potential.analogs?.n ?? 0}</span>
            </div>
          )}

      <div style={{ marginTop: 9 }}>
        {held
          ? <span style={{ fontFamily: T.mono, fontSize: 10, color: T.green }}>✓ marked as held</span>
          : <button onClick={() => onHold(sig.symbol)} disabled={busy}
              style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.brass + "55", background: T.brassSoft, color: T.brass, fontSize: 11.5, cursor: "pointer" }}>
              I&apos;m holding this
            </button>}
      </div>
    </div>
  );
}

export default function Brief({ backendUrl, live, onLeave }) {
  const api = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);
  const [brief, setBrief] = useState(null);
  const [held, setHeld] = useState(new Set());
  const [state, setState] = useState({ busy: true, err: "" });

  const load = useCallback(async () => {
    if (!api) return;
    setState({ busy: true, err: "" });
    try {
      const [b, h] = await Promise.all([api.brief(), api.holdings().catch(() => ({ holdings: [] }))]);
      setBrief(b);
      setHeld(new Set((h.holdings || []).filter(x => x.status !== "closed").map(x => x.symbol)));
      setState({ busy: false, err: "" });
    } catch (e) {
      setState({ busy: false, err: e.message || "Could not load the brief" });
    }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const hold = async (symbol) => {
    setState(s => ({ ...s, busy: true }));
    try { await api.hold(symbol); await load(); }
    catch (e) { setState({ busy: false, err: e.message }); }
  };

  if (!live) {
    return (
      <div style={{ fontFamily: T.sans, border: "1px dashed " + T.line, borderRadius: 12, padding: "24px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 13.5, color: T.ink }}>The brief needs the live backend.</div>
        <div style={{ fontSize: 12, color: T.mute, marginTop: 5, lineHeight: 1.6 }}>
          It is assembled server-side from your holdings, overnight signals and the event calendar.
        </div>
        {onLeave && <button onClick={onLeave} style={{ marginTop: 12, padding: "7px 12px", borderRadius: 7, border: "1px solid " + T.line, background: "transparent", color: T.mute, fontSize: 11.5, cursor: "pointer" }}>Go to the dashboard</button>}
      </div>
    );
  }

  const exits = [...(brief?.exitSignals || [])].sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));
  const byProfile = brief?.newSignals?.byProfile || {};
  const profileKeys = Object.keys(byProfile).filter(k => (byProfile[k] || []).length);
  const ipos = brief?.ipos || [];
  const events = brief?.events || [];
  const conc = brief?.concentration;
  const concWarnings = conc?.warnings || [];
  const nothing = !exits.length && !profileKeys.length && !ipos.length && !events.length && !concWarnings.length;

  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: T.serif, fontSize: 21, lineHeight: 1 }}>This morning</div>
          <DataHealth h={brief?.dataHealth} />
        </div>
        <div style={{ display: "flex", gap: 7 }}>
          <button onClick={load} disabled={state.busy} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid " + T.line, background: "transparent", color: T.mute, fontSize: 11.5, cursor: "pointer" }}>
            {state.busy ? "…" : "↻"}
          </button>
          {/* never trap the user in the brief */}
          {onLeave && <button onClick={onLeave} style={{ padding: "6px 10px", borderRadius: 7, border: "1px solid " + T.line, background: "transparent", color: T.mute, fontSize: 11.5, cursor: "pointer" }}>
            Dashboard →
          </button>}
        </div>
      </div>

      {state.err && <div style={{ marginTop: 12, fontSize: 11.5, color: T.red }}>{state.err}</div>}

      {state.busy && !brief ? (
        <div style={{ marginTop: 18, fontSize: 12.5, color: T.dimSolid }}>Assembling…</div>
      ) : nothing ? (
        <div style={{ marginTop: 20, border: "1px dashed " + T.line, borderRadius: 12, padding: "26px 20px", textAlign: "center" }}>
          <div style={{ fontSize: 13.5, color: T.ink }}>Nothing needs your attention this morning.</div>
          <div style={{ fontSize: 12, color: T.dimSolid, marginTop: 5, lineHeight: 1.6 }}>
            No exit rule fired, no new signal locked, no IPO closing and no event inside three sessions.
            The scan kept running — silence here is a result, not a failure.
          </div>
        </div>
      ) : (
        <>
          {/* 1 · money already at risk */}
          {exits.length > 0 && <>
            <Label accent={T.red} count={exits.length}>Exit signals on your holdings</Label>
            {exits.map(s => (
              <div key={s.id} style={{ background: T.card, border: "1px solid " + (SEV[s.severity] || T.line) + "55",
                borderLeft: "3px solid " + (SEV[s.severity] || T.line), borderRadius: 10, padding: "11px 13px", marginBottom: 7 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: T.mono, fontSize: 12.5, color: T.ink }}>{s.symbol}</span>
                  <span style={{ fontSize: 13, color: SEV[s.severity] || T.mute, fontWeight: 600 }}>{s.headline}</span>
                </div>
                <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7, marginTop: 6 }}>{s.reasoning || s.rationale}</div>
                <div style={{ fontSize: 11.5, color: SEV[s.severity] || T.mute, marginTop: 7 }}>
                  {s.suggestedAction} <span style={{ color: T.dimSolid, fontSize: 10.5 }}>· {s.note || "the call is yours"}</span>
                </div>
              </div>
            ))}
          </>}

          {/* 2 · new signals by profile */}
          {profileKeys.length > 0 && <>
            <Label count={brief?.newSignals?.total}>New signals since last close</Label>
            {profileKeys.map(pid => (
              <div key={pid} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1, color: T.dimSolid, marginBottom: 6 }}>
                  {String(pid).toUpperCase()} · {byProfile[pid].length}
                </div>
                {byProfile[pid].map(sig => (
                  <SignalCard key={sig.id || sig.symbol} sig={sig} busy={state.busy} held={held.has(sig.symbol)} onHold={hold} />
                ))}
              </div>
            ))}
          </>}

          {/* 3 · IPOs */}
          {ipos.length > 0 && <>
            <Label count={ipos.length}>IPOs closing</Label>
            {ipos.map(i => (
              <div key={i.slug || i.name} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "10px 13px", marginBottom: 6 }}>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12.5, color: T.ink }}>{i.name}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.brass }}>{i.verdict || i.take?.verdict_key || "—"}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>closes {i.closeDate || i.close_date || "—"}</span>
                </div>
              </div>
            ))}
          </>}

          {/* 4 · events */}
          {events.length > 0 && <>
            <Label count={events.length}>Events in the next 3 sessions</Label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {events.map((e, i) => (
                <span key={(e.symbol || i) + i} style={{ fontFamily: T.mono, fontSize: 10.5, color: T.amber,
                  border: "1px solid " + T.amber + "44", borderRadius: 6, padding: "4px 8px" }}>
                  {e.symbol} · {e.event?.type || "event"} {e.event?.daysAway != null ? `in ${e.event.daysAway}d` : e.event?.date || ""}
                </span>
              ))}
            </div>
          </>}

          {/* 5 · concentration */}
          {concWarnings.length > 0 && <>
            <Label accent={T.amber} count={concWarnings.length}>Concentration</Label>
            {concWarnings.map((w, i) => (
              <div key={i} style={{ background: T.amber + "12", border: "1px solid " + T.amber + "44", borderRadius: 9,
                padding: "9px 12px", fontSize: 12.5, color: T.amber, lineHeight: 1.55, marginBottom: 6 }}>
                ⚠ {typeof w === "string" ? w : w.message}
              </div>
            ))}
          </>}
        </>
      )}

      <p style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 22, textAlign: "center" }}>
        Decision support, not instructions. Estimates describe what similar setups typically did —
        <span style={{ color: T.brass }}> the call is yours.</span>
      </p>
    </div>
  );
}
