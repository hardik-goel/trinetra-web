"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deskApi, rupee, pctText } from "../lib/desk";
import { request } from "../lib/api";
import { ShortabilityBlock } from "./Shortability";

/* ================================================================
   ONE STOCK, EVERY ANSWER.

   This exists because of a specific confusion: the same stock shows
   up in one tab and not another, and nothing on screen says why. The
   Criteria tab filters to a single profile; the Morning Brief spans
   all of them; the Playbook shows whatever profile is selected. Three
   surfaces, three different answers, all correct, none explaining
   itself.

   So the primary content here is not the price or the levels — it is
   the profile matrix: every enabled profile, whether it locked, and
   which named criteria passed, failed, or could not be evaluated.
   That table IS the explanation. Everything else is secondary.

   Failed criteria are listed as prominently as passed ones. A stock
   that missed on one of four is a different object from one that
   missed on four of four, and the difference is only visible if the
   misses are named.
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C", blue: "#7FA6CE",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

const inS = {
  background: T.card, border: "1px solid " + T.line, borderRadius: 8,
  color: T.ink, padding: "9px 11px", fontSize: 13, fontFamily: T.mono, outline: "none",
};
const btn = p => ({ padding: "9px 14px", borderRadius: 8, border: "1px solid " + (p ? T.brass : T.line),
  background: p ? T.brass : "transparent", color: p ? "#141206" : T.mute,
  fontSize: 12.5, fontWeight: p ? 600 : 400, cursor: "pointer" });

/* Named criteria, coloured by outcome. skipped is its own state and must not
   read as a pass: "we could not judge this" is not "this was fine". */
function CriteriaList({ passed = [], failed = [], skipped = [] }) {
  const row = (name, tone, mark, title) => (
    <span key={mark + name} title={title}
      style={{ fontFamily: T.mono, fontSize: 10, color: tone, border: "1px solid " + tone + "44",
        borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap" }}>
      {mark} {name}
    </span>
  );
  if (!passed.length && !failed.length && !skipped.length) {
    return <span style={{ fontSize: 11, color: T.dimSolid }}>no criteria evaluated for this profile</span>;
  }
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 5 }}>
      {passed.map(n => row(n, T.green, "✓"))}
      {failed.map(n => row(n, T.red, "✕"))}
      {skipped.map(n => row(n, T.amber, "◌", "Could not be evaluated — no data. Not a pass and not a failure."))}
    </div>
  );
}

function ProfileMatrix({ profiles }) {
  const list = profiles || [];
  if (!list.length) return null;
  /* Holdings-only profiles are inert unless the stock is held, and showing them
     as "not locked" alongside the rest reads as four more failures. */
  const [main, holdingsOnly] = [
    list.filter(p => p.appliesTo !== "holdings"),
    list.filter(p => p.appliesTo === "holdings"),
  ];

  const card = p => (
    <div key={p.id} style={{ background: p.locked ? T.brassSoft : T.raised,
      border: "1px solid " + (p.locked ? T.brass + "4A" : T.line), borderRadius: 9,
      padding: "9px 11px", marginBottom: 7 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: p.locked ? T.brass : T.mute, fontWeight: p.locked ? 600 : 400 }}>
          {p.name}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: .8,
          color: p.locked ? T.green : T.dimSolid,
          border: "1px solid " + (p.locked ? T.green : T.dimSolid) + "55", borderRadius: 4, padding: "1px 5px" }}>
          {p.locked ? "LOCKED" : "not locked"}
        </span>
        {p.horizon && <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>{p.horizon}</span>}
        {p.lockQuality && <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>{p.lockQuality}</span>}
      </div>
      <CriteriaList passed={p.passed} failed={p.failed} skipped={p.skipped} />
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.brass, margin: "4px 0 8px" }}>
        WHY IT APPEARS WHERE IT DOES
      </div>
      <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 9 }}>
        Each panel in the app filters to one profile or spans several, which is why the same stock can be present in one
        and absent from another. This is every profile at once, with the criteria named.
      </div>
      {main.map(card)}
      {holdingsOnly.length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 6, lineHeight: 1.6 }}>
          {holdingsOnly.map(p => p.name).join(" · ")} — holdings-only, inert unless you own this.
        </div>
      )}
    </div>
  );
}

export default function StockLookup({ backendUrl, live, initialSymbol, onHold, held }) {
  const api = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);
  const [q, setQ] = useState(initialSymbol || "");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const look = useCallback(async (symbol) => {
    const sym = String(symbol || "").trim().toUpperCase();
    if (!sym || !backendUrl) return;
    setBusy(true); setErr(null);
    try {
      setData(await request(backendUrl, "/stock?symbol=" + encodeURIComponent(sym)));
      setErr(null);
    } catch (e) {
      setData(null);
      /* The 404 body is the useful part here — it carries didYouMean. A
         network failure has no body, and saying "not found" for one would
         be a different claim from the one the server made. */
      setErr(e.body || { error: e.status
        ? e.message
        : "Backend unreachable — a sleeping free instance takes ~30s to wake." });
    } finally { setBusy(false); }
  }, [backendUrl]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { if (initialSymbol) look(initialSymbol); }, [initialSymbol, look]);

  if (!live) {
    return <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.mute, lineHeight: 1.6 }}>
      Symbol lookup needs the live backend — it reads the criteria the engine is actually running.
    </div>;
  }

  const d = data;
  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <form onSubmit={e => { e.preventDefault(); look(q); }}
        style={{ display: "flex", gap: 7, marginBottom: 14 }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value.toUpperCase())}
          placeholder="Symbol — e.g. POLYCAB" style={{ ...inS, flex: 1 }} />
        <button type="submit" disabled={busy || !q.trim()} style={{ ...btn(true), opacity: busy || !q.trim() ? .4 : 1 }}>
          {busy ? "…" : "Look up"}
        </button>
      </form>

      {err && (
        <div style={{ background: T.raised, border: "1px solid " + T.line, borderRadius: 9, padding: "11px 13px" }}>
          <div style={{ fontSize: 12.5, color: T.amber }}>{err.error || "Not found."}</div>
          {/* The backend's suggestions, one tap each — a typo should cost a
              click, not a re-read of the universe list. */}
          {err.didYouMean?.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "baseline" }}>
              <span style={{ fontSize: 11, color: T.mute }}>Did you mean</span>
              {err.didYouMean.map(s => (
                <button key={s} onClick={() => { setQ(s); look(s); }}
                  style={{ ...btn(), padding: "4px 9px", fontFamily: T.mono, fontSize: 11.5 }}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {d && (
        <div>
          <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", marginBottom: 4 }}>
            <span style={{ fontFamily: T.mono, fontSize: 17, color: T.ink }}>{d.symbol}</span>
            <span style={{ fontFamily: T.mono, fontSize: 15, color: T.brass }}>{rupee(d.price, 2)}</span>
            {d.name && <span style={{ fontSize: 12, color: T.mute }}>{d.name}</span>}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginBottom: 12 }}>
            {[d.sector, (d.groups || []).join(" · "),
              d.dataAge?.delayed ? `delayed ~${Math.round((d.dataAge.lagSeconds || 900) / 60)}m` : null]
              .filter(Boolean).join("  ·  ")}
          </div>

          {/* Held state and fired signals change how everything below reads. */}
          {(d.holding || d.signalsFired?.count > 0) && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {d.holding && (
                <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.green,
                  border: "1px solid " + T.green + "55", borderRadius: 5, padding: "3px 8px" }}>
                  held{d.holding.qty ? ` · ${d.holding.qty}` : ""}
                  {d.holding.gainPct != null ? ` · ${pctText(d.holding.gainPct)}` : ""}
                </span>
              )}
              {d.signalsFired?.count > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.brass,
                  border: "1px solid " + T.brass + "55", borderRadius: 5, padding: "3px 8px" }}>
                  {d.signalsFired.count} signal{d.signalsFired.count === 1 ? "" : "s"} fired
                </span>
              )}
              {onHold && !d.holding && (
                <button onClick={() => onHold(d.symbol)} style={{ ...btn(), padding: "3px 9px", fontSize: 11 }}>
                  {held?.has(d.symbol) ? "marked" : "I'm holding this"}
                </button>
              )}
            </div>
          )}

          <ProfileMatrix profiles={d.profiles} />

          {/* Missing fundamentals is why a criterion reads skipped rather than
              failed, so it belongs next to the matrix that shows the skip. */}
          {d.fundamentalsMissing && (
            <div style={{ background: T.amber + "12", border: "1px solid " + T.amber + "44", borderRadius: 9,
              padding: "9px 11px", margin: "10px 0", fontSize: 11.5, color: T.amber, lineHeight: 1.6 }}>
              No fundamentals cached for {d.symbol}. Any fundamentals criterion above is unevaluated rather than failed —
              a lock here rests on the other criteria alone.
            </div>
          )}

          {d.playbook && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.4, color: T.brass, marginBottom: 7 }}>LEVELS</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[[d.playbook.actionLabel || "Entry", d.playbook.entry],
                  [d.playbook.targetLabel || "Target", d.playbook.target],
                  ["Stop", d.playbook.stop]].map(([label, v]) => (
                  <div key={label} style={{ background: T.raised, border: "1px solid " + T.line, borderRadius: 8,
                    padding: "7px 10px", minWidth: 110 }}>
                    <div style={{ fontFamily: T.mono, fontSize: 8.5, letterSpacing: 1, color: T.dimSolid }}>{label.toUpperCase()}</div>
                    <div style={{ fontFamily: T.mono, fontSize: 12.5, color: T.ink, marginTop: 2 }}>
                      {v == null ? "—" : typeof v === "object"
                        ? (v.low != null && v.high != null && v.low !== v.high ? `${rupee(v.low, 0)}–${rupee(v.high, 0)}` : rupee(v.low ?? v.high ?? v.price, 0))
                        : rupee(v, 0)}
                    </div>
                  </div>
                ))}
              </div>
              {d.playbook.reading && (
                <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 8 }}>{d.playbook.reading}</div>
              )}
            </div>
          )}

          {d.shortability && <ShortabilityBlock s={d.shortability} />}

          {d.nextEvent && (
            <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid, marginTop: 10 }}>
              next event — {d.nextEvent.type || "event"} {d.nextEvent.date || ""}
            </div>
          )}
        </div>
      )}

      {!d && !err && !busy && (
        <div style={{ fontSize: 12, color: T.dimSolid, lineHeight: 1.7 }}>
          Type a symbol to see every profile at once — which locked, which did not, and exactly which named criteria
          passed or failed in each. This is the answer to &ldquo;why is this stock in one tab and not another&rdquo;.
        </div>
      )}
    </div>
  );
}
