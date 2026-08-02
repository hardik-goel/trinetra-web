"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  HORIZONS, KITE_MONTHLY, MIN_IPOS, MIN_SIGNALS, MIN_TRADES, RANGE_PRESETS,
  byCombo, byCriterion, dayISO, daysBetween, enough, inr, pctOrThin,
  presetRange, shortDate, signed, summariseHorizons, trackApi,
} from "../lib/track";
import { fetchPravesh } from "../lib/pravesh";

/* ================================================================
   TRACK RECORD — did this instrument earn its keep?

   The module exists to answer one question honestly enough to spend
   ₹2,000/month on, or not to. So it is built to disappoint: every
   percentage carries its n, thin samples refuse to print a number at
   all, losses sit next to wins at the same size, and the comparison
   that can embarrass the app — your picks vs taking every signal —
   is on the same screen as the wins.
   ================================================================ */

const T = {
  bg: "#0E0F0C", panel: "#14150F", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassDeep: "#A8863F", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C", blue: "#7FA6CE",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
export const TRACK_T = T;

const CSS = `
  .track table { border-collapse: collapse; width: 100%; }
  .track button, .track input, .track select, .track textarea { font-family: inherit; }
  .track button { cursor: pointer; }
  .track button:focus-visible, .track input:focus, .track select:focus, .track textarea:focus { outline: 1.5px solid ${T.brass}; outline-offset: 1px; }
  @keyframes trackRise { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
  .track .rise { animation: trackRise .35s cubic-bezier(.2,.8,.2,1); }
  @media (prefers-reduced-motion: reduce) { .track .rise { animation: none !important; } }
`;

/* The tab glyph: a ledger rule with a rising mark — measurement, not prophecy. */
export function RecordGlyph({ size = 13, color = T.brass }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 14" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path d="M1.2 12.4h9.6" stroke={color} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M2 9.6l2.6-3 2.2 1.9L10 4.2" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10" cy="4.2" r="1" fill={color} />
    </svg>
  );
}

const chip = (active) => ({
  padding: "7px 12px", borderRadius: 8,
  border: "1px solid " + (active ? T.brass + "55" : T.line),
  background: active ? T.brassSoft : T.card,
  color: active ? T.ink : T.mute,
  fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 6,
});
const btn = (primary) => ({
  padding: "7px 12px", borderRadius: 7,
  border: "1px solid " + (primary ? T.brass : T.line),
  background: primary ? T.brass : "transparent",
  color: primary ? "#141206" : T.mute, fontSize: 11.5, fontWeight: primary ? 600 : 400,
});
const inS = {
  background: T.bg, border: "1px solid " + T.line, color: T.ink,
  fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px",
};
const Label = ({ children, accent }) => (
  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: accent || T.brass, marginBottom: 8, textTransform: "uppercase" }}>{children}</div>
);
const tone = (v) => (v == null ? T.mute : v > 0 ? T.green : v < 0 ? T.red : T.mute);
const th = (extra = {}) => ({
  textAlign: "left", fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid,
  fontWeight: 400, padding: "7px 8px", borderBottom: "1px solid " + T.line, whiteSpace: "nowrap", ...extra,
});
const td = (extra = {}) => ({
  padding: "8px", borderBottom: "1px solid " + T.lineSoft, fontSize: 12, color: T.mute, ...extra,
});

/** A statistic that refuses to print a number it cannot support. */
function Stat({ label, value, n, min, hint, big }) {
  const thin = n != null && min != null && !enough(n, min);
  return (
    <div style={{ flex: "1 1 130px", background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1, color: T.dimSolid }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: T.mono, fontSize: big ? 17 : 14, marginTop: 4, color: thin ? T.dimSolid : (value?.color || T.ink) }}>
        {thin ? "insufficient" : value?.text ?? value ?? "—"}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, marginTop: 3 }}>
        {n != null ? `n=${n}` : ""}{hint ? (n != null ? " · " : "") + hint : ""}
      </div>
    </div>
  );
}

/* ── calendar range picker ───────────────────────────────────────── */

function monthMatrix(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const start = (first.getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = Array(start).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(Date.UTC(year, month, d)));
  while (cells.length % 7) cells.push(null);
  return cells;
}

function Calendar({ from, to, onPick }) {
  const anchor = from ? new Date(from + "T00:00:00Z") : new Date();
  const [view, setView] = useState({ y: anchor.getUTCFullYear(), m: anchor.getUTCMonth() });
  const cells = monthMatrix(view.y, view.m);
  const label = new Date(Date.UTC(view.y, view.m, 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const step = (d) => setView(v => {
    const n = new Date(Date.UTC(v.y, v.m + d, 1));
    return { y: n.getUTCFullYear(), m: n.getUTCMonth() };
  });
  const today = dayISO(new Date());
  return (
    <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: 12, marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={() => step(-1)} style={{ ...btn(), padding: "3px 9px" }}>‹</button>
        <span style={{ fontSize: 12.5, color: T.ink }}>{label}</span>
        <button onClick={() => step(1)} style={{ ...btn(), padding: "3px 9px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontFamily: T.mono, fontSize: 8.5, color: T.dimSolid, padding: "2px 0" }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = dayISO(d);
          const isFrom = iso === from, isTo = iso === to;
          const inRange = from && to && iso > from && iso < to;
          const future = iso > today;
          return (
            <button key={i} onClick={() => !future && onPick(iso)} disabled={future}
              style={{
                padding: "5px 0", borderRadius: 5, fontFamily: T.mono, fontSize: 10.5,
                border: "1px solid " + (isFrom || isTo ? T.brass : "transparent"),
                background: isFrom || isTo ? T.brassSoft : inRange ? T.raised : "transparent",
                color: future ? T.dim : isFrom || isTo ? T.brass : inRange ? T.ink : T.mute,
                cursor: future ? "not-allowed" : "pointer",
              }}>
              {d.getUTCDate()}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 8 }}>
        {from && !to ? "Pick the end date." : "Pick a start date, then an end date."} Future dates are not selectable.
      </div>
    </div>
  );
}

function RangeBar({ range, setRange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from: "", to: "" });
  const pick = (iso) => {
    if (!draft.from || draft.to) { setDraft({ from: iso, to: "" }); return; }
    const [from, to] = iso < draft.from ? [iso, draft.from] : [draft.from, iso];
    setDraft({ from, to });
    setRange({ preset: "custom", from, to });
    setOpen(false);
  };
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {RANGE_PRESETS.map(([days, label]) => (
          <button key={days} onClick={() => { setOpen(false); setRange({ preset: days, ...presetRange(days) }); }}
            style={chip(range.preset === days)}>{label}</button>
        ))}
        <button onClick={() => { setDraft({ from: "", to: "" }); setOpen(o => !o); }} style={chip(range.preset === "custom")}>
          Custom{range.preset === "custom" ? ` · ${shortDate(range.from)}–${shortDate(range.to)}` : ""}
        </button>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginLeft: "auto" }}>
          {range.from} → {range.to} · {daysBetween(range.from, range.to)}d
        </span>
      </div>
      {open && <Calendar from={draft.from} to={draft.to} onPick={pick} />}
    </div>
  );
}

/* ── view 1: signals ─────────────────────────────────────────────── */

function HorizonStrip({ horizons, title }) {
  return (
    <>
      <Label>{title}</Label>
      {/* Every horizon is shown, always. Picking the flattering one is the
          single easiest way for a track record to lie. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {HORIZONS.map(d => {
          const h = horizons[`ret${d}d`] || {};
          const wr = pctOrThin(h.winRate, h.n, MIN_SIGNALS);
          return (
            <div key={d} style={{ flex: "1 1 120px", background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1, color: T.dimSolid }}>{d}-DAY</div>
              <div style={{ fontFamily: T.mono, fontSize: 13.5, marginTop: 4, color: wr.thin ? T.dimSolid : h.winRate >= 50 ? T.green : T.red }}>
                {wr.thin ? "insufficient" : `${h.winRate}% win`}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.mute, marginTop: 3 }}>
                avg <span style={{ color: tone(h.avg) }}>{signed(h.avg)}</span>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, marginTop: 3 }}>
                n={h.n ?? 0}{h.pending ? ` · ${h.pending} pending` : ""}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, marginTop: 2 }}>
                best {signed(h.best)} · worst {signed(h.worst)}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SignalsView({ signals, trades, onLog, assumptions }) {
  const horizons = useMemo(() => summariseHorizons(signals), [signals]);
  const combos = useMemo(() => byCombo(signals), [signals]);
  const criteria = useMemo(() => byCriterion(signals), [signals]);
  const takenIds = useMemo(() => new Set(trades.map(t => t.signalId).filter(Boolean)), [trades]);

  if (!signals.length) {
    return (
      <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "26px 20px", textAlign: "center", marginTop: 16 }}>
        <div style={{ fontSize: 13, color: T.mute }}>No signals fired in this range.</div>
        <div style={{ fontSize: 12, color: T.dimSolid, marginTop: 4, lineHeight: 1.6 }}>
          Nothing to measure yet. The backend records every signal from the moment it starts running — history before
          that does not exist and is not reconstructed.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <HorizonStrip horizons={horizons} title={`Forward returns · ${signals.length} signals fired`} />

      <Label>Every signal, and what happened next</Label>
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto", marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              {["Symbol", "Fired", "Price", "Locked", "1d", "3d", "7d", "30d", "Max ↑", "Max ↓", ""].map((h, i) => (
                <th key={h + i} style={th(i > 3 ? { textAlign: "right" } : {})}>{h.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {signals.map(s => {
              const taken = takenIds.has(s.id);
              return (
                <tr key={s.id}>
                  <td style={td({ fontFamily: T.mono, fontSize: 12, color: T.ink, whiteSpace: "nowrap" })}>{s.symbol}</td>
                  <td style={td({ fontFamily: T.mono, fontSize: 10.5, whiteSpace: "nowrap" })}>{shortDate(s.firedAt)}</td>
                  <td style={td({ fontFamily: T.mono, fontSize: 11 })}>{inr(s.price, 2)}</td>
                  <td style={td({ fontFamily: T.mono, fontSize: 10, color: T.brass, whiteSpace: "nowrap" })}
                      title={(s.criteria || []).filter(c => c.pass).map(c => c.name).join(" · ")}>
                    {s.combo} <span style={{ color: T.dimSolid }}>{s.count}/{s.total}</span>
                  </td>
                  {HORIZONS.map(d => {
                    const v = s.outcome?.[`ret${d}d`];
                    return (
                      <td key={d} style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: v == null ? T.dim : tone(v) })}>
                        {v == null ? "pending" : signed(v)}
                      </td>
                    );
                  })}
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: T.green })}>{signed(s.outcome?.maxGain)}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: T.red })}>{signed(s.outcome?.maxDrawdown)}</td>
                  <td style={td({ textAlign: "right", whiteSpace: "nowrap" })}>
                    {taken
                      ? <span style={{ fontFamily: T.mono, fontSize: 9, color: T.green }}>✓ logged</span>
                      : <button onClick={() => onLog(s)} title="Log whether you took this one"
                          style={{ ...btn(), padding: "4px 8px", fontSize: 10, borderColor: T.brass + "44", color: T.brass }}>
                          Did you take this?
                        </button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Which combination is actually carrying the record */}
      <Label>By criteria combination — does 3/3 beat 2/3?</Label>
      <div style={{ fontSize: 11.5, color: T.dimSolid, marginTop: -4, marginBottom: 8, lineHeight: 1.55 }}>
        Split by the exact set that locked. If a bigger combination does not show a better 7-day record here, the extra
        criterion is costing you signals without buying accuracy — on this sample.
      </div>
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto", marginBottom: 16 }}>
        <table>
          <thead><tr>{["Combination", "Signals", "7d win", "7d avg", "30d win", "30d avg"].map((h, i) => (
            <th key={h} style={th(i ? { textAlign: "right" } : {})}>{h.toUpperCase()}</th>))}</tr></thead>
          <tbody>
            {combos.map(c => {
              const h7 = c.horizons.ret7d, h30 = c.horizons.ret30d;
              const w7 = pctOrThin(h7.winRate, h7.n, MIN_SIGNALS), w30 = pctOrThin(h30.winRate, h30.n, MIN_SIGNALS);
              return (
                <tr key={c.combo}>
                  <td style={td({ fontFamily: T.mono, fontSize: 11.5, color: T.ink })}>{c.combo} <span style={{ color: T.dimSolid }}>({c.count})</span></td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11 })}>{c.n}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 10.5, color: w7.thin ? T.dimSolid : T.ink })}>{w7.text}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: tone(h7.avg) })}>{signed(h7.avg)}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 10.5, color: w30.thin ? T.dimSolid : T.ink })}>{w30.text}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: tone(h30.avg) })}>{signed(h30.avg)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Label>By individual criterion — with it vs without it</Label>
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto" }}>
        <table>
          <thead><tr>{["Criterion", "With · 7d avg", "n", "Without · 7d avg", "n", "Difference"].map((h, i) => (
            <th key={h} style={th(i ? { textAlign: "right" } : {})}>{h.toUpperCase()}</th>))}</tr></thead>
          <tbody>
            {criteria.map(c => {
              const a = c.with.ret7d, b = c.without.ret7d;
              const diff = a.avg != null && b.avg != null ? Math.round((a.avg - b.avg) * 100) / 100 : null;
              return (
                <tr key={c.key}>
                  <td style={td({ fontFamily: T.mono, fontSize: 11.5, color: T.ink })}>{c.key}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: tone(a.avg) })}>{signed(a.avg)}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 10, color: T.dimSolid })}>{a.n}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: tone(b.avg) })}>{signed(b.avg)}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 10, color: T.dimSolid })}>{b.n}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: tone(diff) })}>
                    {diff == null ? "—" : signed(diff, 1, " pp")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.55, marginTop: 10 }}>
        Differences on a handful of signals are noise. Nothing here is a significance test, and none of these splits
        adjusts for the market moving as a whole — a good week lifts every combination at once.
      </div>

      {/* The backend states what these numbers do and do not include. API.md is
          explicit that rendering this is not optional: a win rate without its
          costs caveat is worse than showing nothing. */}
      {assumptions?.length > 0 && (
        <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.7, marginTop: 12, borderTop: "1px solid " + T.lineSoft, paddingTop: 10 }}>
          {assumptions.map(a => <div key={a}>· {a}</div>)}
        </div>
      )}
    </div>
  );
}

/* ── view 2: paper trades ────────────────────────────────────────── */

function TradeForm({ draft, setDraft, onSubmit, onCancel, busy }) {
  const set = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));
  const valid = draft.symbol && +draft.entryPrice > 0 && +draft.qty > 0;
  return (
    <div className="rise" style={{ background: T.raised, border: "1px solid " + T.brass + "44", borderRadius: 11, padding: 14, marginBottom: 14 }}>
      <Label>{draft.signalId ? "Log this signal as a trade" : "Log a paper trade"}</Label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={draft.symbol} onChange={set("symbol")} placeholder="SYMBOL" style={{ ...inS, flex: "1 1 110px", textTransform: "uppercase" }} />
        <input type="date" value={draft.entryDate} onChange={set("entryDate")} style={{ ...inS, flex: "1 1 130px" }} />
        <input type="number" step="any" value={draft.entryPrice} onChange={set("entryPrice")} placeholder="Entry ₹" style={{ ...inS, width: 92 }} />
        <input type="number" step="1" value={draft.qty} onChange={set("qty")} placeholder="Qty" style={{ ...inS, width: 72 }} />
        <input type="number" step="any" value={draft.stopLoss} onChange={set("stopLoss")} placeholder="Stop" style={{ ...inS, width: 82 }} />
        <input type="number" step="any" value={draft.target} onChange={set("target")} placeholder="Target" style={{ ...inS, width: 82 }} />
      </div>
      <textarea value={draft.notes} onChange={set("notes")} rows={2} placeholder="Why I took it — the thesis, in your words. This is what you grade yourself against later."
        style={{ ...inS, width: "100%", marginTop: 8, resize: "vertical", fontFamily: T.sans, fontSize: 12, lineHeight: 1.5 }} />
      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
        <button onClick={onSubmit} disabled={!valid || busy} style={{ ...btn(true), opacity: valid && !busy ? 1 : .4 }}>
          {busy ? "Saving…" : "Log trade"}
        </button>
        <button onClick={onCancel} style={btn()}>Cancel</button>
        {draft.signalId && <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>linked to signal {draft.signalId.slice(0, 10)}</span>}
      </div>
    </div>
  );
}

function CloseForm({ trade, onClose, onCancel, busy }) {
  const [exitPrice, setExitPrice] = useState(trade.mtm?.price ?? "");
  const [exitDate, setExitDate] = useState(dayISO(new Date()));
  const [exitReason, setExitReason] = useState("manual");
  return (
    <tr>
      <td colSpan={9} style={{ padding: "10px 8px", background: T.raised, borderBottom: "1px solid " + T.lineSoft }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, color: T.mute }}>Close {trade.symbol}:</span>
          <input type="date" value={exitDate} onChange={e => setExitDate(e.target.value)} style={{ ...inS, width: 140 }} />
          <input type="number" step="any" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="Exit ₹" style={{ ...inS, width: 92 }} />
          <select value={exitReason} onChange={e => setExitReason(e.target.value)} style={{ ...inS }}>
            <option value="manual">manual</option><option value="target">target hit</option>
            <option value="stop">stop hit</option><option value="thesis-broken">thesis broken</option>
          </select>
          <button disabled={!(+exitPrice > 0) || busy} onClick={() => onClose({ status: "closed", exitPrice: +exitPrice, exitDate, exitReason })}
            style={{ ...btn(true), opacity: +exitPrice > 0 && !busy ? 1 : .4 }}>Close trade</button>
          <button onClick={onCancel} style={btn()}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}

function PaperView({ trades, stats, draft, setDraft, onSubmit, onPatch, onDelete, busy, showForm, setShowForm }) {
  const [closing, setClosing] = useState(null);
  const open = trades.filter(t => t.status === "open");
  const closed = trades.filter(t => t.status === "closed");
  const sel = stats?.selection;
  const wr = pctOrThin(stats?.winRate, stats?.trades?.closed, MIN_TRADES);

  return (
    <div style={{ marginTop: 16 }}>
      {showForm
        ? <TradeForm draft={draft} setDraft={setDraft} onSubmit={onSubmit} onCancel={() => setShowForm(false)} busy={busy} />
        : <button onClick={() => setShowForm(true)} style={{ ...btn(true), marginBottom: 14 }}>+ Log a paper trade</button>}

      {/* Stats first: the record, not the positions, is the point of the view. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <Stat label="Closed" value={{ text: String(stats?.trades?.closed ?? 0) }} hint={`${stats?.trades?.open ?? 0} open`} />
        <Stat label="Win rate" value={{ text: wr.text, color: stats?.winRate >= 50 ? T.green : T.red }} n={stats?.trades?.closed ?? 0} min={MIN_TRADES} />
        <Stat label="Realised" value={{ text: inr(stats?.realisedPnl), color: tone(stats?.realisedPnl) }} />
        <Stat label="Unrealised" value={{ text: inr(stats?.unrealisedPnl), color: tone(stats?.unrealisedPnl) }} hint="open, marked" />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Stat label="Avg win" value={{ text: inr(stats?.avgWin), color: T.green }} />
        <Stat label="Avg loss" value={{ text: inr(stats?.avgLoss), color: T.red }} />
        <Stat label="Expectancy" value={{ text: inr(stats?.expectancy), color: tone(stats?.expectancy) }} hint="per trade" n={stats?.trades?.closed ?? 0} min={MIN_TRADES} />
        <Stat label="Profit factor" value={{ text: stats?.profitFactor != null ? String(stats.profitFactor) : "—" }} hint={stats?.profitFactorNote || ""} />
        <Stat label="Largest win" value={{ text: inr(stats?.largestWin), color: T.green }} />
        <Stat label="Largest loss" value={{ text: inr(stats?.largestLoss), color: T.red }} />
      </div>

      {/* The comparison that can embarrass the app — and the user. */}
      {sel && (
        <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 11, padding: "12px 14px", marginBottom: 16 }}>
          <Label>Your picks vs taking every signal</Label>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: T.mute }}>
            <div>Your closed trades: <span style={{ fontFamily: T.mono, color: tone(sel.yourTrades?.avgReturnPct) }}>{signed(sel.yourTrades?.avgReturnPct)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}> n={sel.yourTrades?.n ?? 0}</span></div>
            <div>Every signal at {sel.horizon}d: <span style={{ fontFamily: T.mono, color: tone(sel.everySignal?.avgReturnPct) }}>{signed(sel.everySignal?.avgReturnPct)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}> n={sel.everySignal?.n ?? 0}{sel.everySignal?.pending ? ` · ${sel.everySignal.pending} pending` : ""}</span></div>
          </div>
          <div style={{ fontSize: 12.5, marginTop: 8, color: sel.edgePct == null ? T.dimSolid : sel.edgePct > 0 ? T.green : T.red }}>
            {sel.edgePct == null
              ? "Not enough on both sides to compare yet."
              : sel.edgePct > 0
                ? `Your selection is ${signed(sel.edgePct, 1, " pp")} ahead of taking every signal.`
                : `Taking every signal would have beaten your selection by ${signed(Math.abs(sel.edgePct), 1, " pp")}. On this sample the honest read is to take more of the signals, not fewer.`}
          </div>
        </div>
      )}

      {/* positions */}
      {[["Open positions", open, true], ["Closed trades", closed, false]].map(([title, rows, isOpen]) => (
        <div key={title} style={{ marginBottom: 16 }}>
          <Label>{title} · {rows.length}</Label>
          {!rows.length
            ? <div style={{ border: "1px dashed " + T.line, borderRadius: 10, padding: "16px 12px", textAlign: "center", fontSize: 12, color: T.dimSolid }}>
                {isOpen ? "Nothing open." : "Nothing closed yet — a record starts when trades finish."}
              </div>
            : <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto" }}>
                <table>
                  <thead><tr>
                    {(isOpen ? ["Symbol", "Entry", "Price", "Qty", "Stop/Target", "Mark", "Unrealised", "", ""]
                             : ["Symbol", "Entry", "Exit", "Qty", "Reason", "Return", "Realised", "", ""]).map((h, i) => (
                      <th key={h + i} style={th(i > 3 ? { textAlign: "right" } : {})}>{h.toUpperCase()}</th>))}
                  </tr></thead>
                  <tbody>
                    {rows.map(t => (
                      <React.Fragment key={t.id}>
                        <tr>
                          <td style={td({ fontFamily: T.mono, fontSize: 12, color: T.ink })} title={t.notes || undefined}>
                            {t.symbol}{t.notes ? <span style={{ color: T.dimSolid }} title={t.notes}> ✎</span> : null}
                          </td>
                          <td style={td({ fontFamily: T.mono, fontSize: 10.5 })}>{shortDate(t.entryDate)} · {inr(t.entryPrice, 2)}</td>
                          <td style={td({ fontFamily: T.mono, fontSize: 11 })}>
                            {isOpen ? inr(t.entryPrice, 2) : `${shortDate(t.exitDate)} · ${inr(t.exitPrice, 2)}`}
                          </td>
                          <td style={td({ fontFamily: T.mono, fontSize: 11 })}>{t.qty}</td>
                          <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 10.5 })}>
                            {isOpen ? `${t.stopLoss != null ? inr(t.stopLoss, 2) : "—"} / ${t.target != null ? inr(t.target, 2) : "—"}` : (t.exitReason || "—")}
                          </td>
                          <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11 })}>
                            {isOpen ? (t.mtm ? inr(t.mtm.price, 2) : "—") : <span style={{ color: tone(t.realisedPct) }}>{signed(t.realisedPct)}</span>}
                          </td>
                          <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: tone(isOpen ? t.mtm?.unrealisedPnl : t.realisedPnl) })}>
                            {isOpen ? (t.mtm ? `${inr(t.mtm.unrealisedPnl)} (${signed(t.mtm.unrealisedPct)})` : "unmarked") : inr(t.realisedPnl)}
                          </td>
                          <td style={td({ textAlign: "right", whiteSpace: "nowrap" })}>
                            {isOpen && <button onClick={() => setClosing(closing === t.id ? null : t.id)} style={{ ...btn(), padding: "4px 8px", fontSize: 10 }}>Close</button>}
                            {isOpen && t.mtm?.stopHit && <span title="Price is at or below your stop" style={{ color: T.red, marginLeft: 6 }}>⚠</span>}
                            {isOpen && t.mtm?.targetHit && <span title="Price is at or above your target" style={{ color: T.green, marginLeft: 6 }}>◎</span>}
                          </td>
                          <td style={td({ textAlign: "right" })}>
                            <button onClick={() => onDelete(t.id)} title="Delete this record" style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 11 }}>✕</button>
                          </td>
                        </tr>
                        {closing === t.id && <CloseForm trade={t} busy={busy} onCancel={() => setClosing(null)}
                          onClose={patch => { onPatch(t.id, patch); setClosing(null); }} />}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>}
        </div>
      ))}

      {stats?.assumptions?.length > 0 && (
        <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.7, borderTop: "1px solid " + T.lineSoft, paddingTop: 10 }}>
          {stats.assumptions.map(a => <div key={a}>· {a}</div>)}
        </div>
      )}
    </div>
  );
}

/* ── view 3: IPOs ────────────────────────────────────────────────── */

function IpoView({ pravesh, apps, stats, onApply, onPatch, onDelete, busy, range }) {
  const [draft, setDraft] = useState(null);
  const inRange = (d) => d && d >= range.from && d <= range.to;

  // What the engine suggested in this window, with the verdict it gave then.
  const suggested = useMemo(() => {
    if (!pravesh) return [];
    const live = (pravesh.ipos || []).filter(i => inRange(i.close_date) || inRange(i.open_date));
    const past = (pravesh.history || []).filter(h => inRange(h.listing_date))
      .map(h => ({ slug: h.ipo_slug, name: h.ipo_name, segment: h.segment, close_date: null, listing_date: h.listing_date,
        take: { verdict_key: h.verdict_key }, listing_gain_pct: h.listing_gain_pct, correct: h.correct }));
    return [...live, ...past];
  }, [pravesh, range.from, range.to]); // eslint-disable-line

  const appByName = useMemo(() => {
    const m = {};
    for (const a of apps) m[(a.ipoName || "").toLowerCase()] = a;
    return m;
  }, [apps]);

  const decided = (stats?.applied ?? 0) - (stats?.pendingAllotment ?? 0);
  const allot = pctOrThin(stats?.allotmentRate, decided, MIN_IPOS);
  const skipped = stats?.skipped;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Stat label="Applied" value={{ text: String(stats?.applied ?? apps.length) }} hint={stats?.pendingAllotment ? `${stats.pendingAllotment} awaiting` : ""} />
        <Stat label="Allotment rate" value={{ text: allot.text }} n={decided} min={MIN_IPOS} />
        <Stat label="Avg listing gain" value={{ text: signed(stats?.avgListingGainOnAllotted), color: tone(stats?.avgListingGainOnAllotted) }} hint="on allotted" n={decided} min={MIN_IPOS} />
        {/* What the engine's own positive calls did on the ones you skipped —
            the opportunity cost, which is the number that can indict the app. */}
        <Stat label="Skipped · engine said apply"
          value={{ text: skipped?.available ? signed(skipped.avgListingGainOnThose) : "—", color: tone(skipped?.avgListingGainOnThose) }}
          hint={skipped?.available ? `${skipped.engineSaidApply} of ${skipped.total} skipped` : (skipped?.reason || "engine feed unavailable")}
          n={skipped?.available ? skipped.engineSaidApply : null} min={MIN_IPOS} />
      </div>

      <Label>What the engine suggested in this range</Label>
      {!pravesh && <div style={{ fontSize: 11.5, color: T.dimSolid, marginBottom: 10 }}>Pravesh feed unreachable — showing only what you logged.</div>}
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto", marginBottom: 16 }}>
        <table>
          <thead><tr>{["IPO", "Verdict then", "Closed / listed", "Listing gain", "You"].map((h, i) => (
            <th key={h} style={th(i > 2 ? { textAlign: "right" } : {})}>{h.toUpperCase()}</th>))}</tr></thead>
          <tbody>
            {!suggested.length && <tr><td colSpan={5} style={td({ textAlign: "center", padding: "18px 8px", color: T.dimSolid })}>
              No IPOs in this range.</td></tr>}
            {suggested.map(i => {
              const app = appByName[(i.name || "").toLowerCase()];
              return (
                <tr key={i.slug || i.name}>
                  <td style={td({ fontSize: 12.5, color: T.ink })}>{i.name}
                    {i.segment === "SME" && <span style={{ fontFamily: T.mono, fontSize: 8.5, color: T.amber, marginLeft: 6 }}>SME</span>}</td>
                  <td style={td({ fontFamily: T.mono, fontSize: 10.5, color: T.brass })}>{i.take?.verdict_key || "—"}</td>
                  <td style={td({ fontFamily: T.mono, fontSize: 10.5 })}>{shortDate(i.close_date || i.listing_date)}</td>
                  <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: tone(i.listing_gain_pct) })}>
                    {i.listing_gain_pct == null ? "—" : signed(i.listing_gain_pct)}
                  </td>
                  <td style={td({ textAlign: "right", whiteSpace: "nowrap" })}>
                    {app
                      ? <span style={{ fontFamily: T.mono, fontSize: 10, color: T.green }}>✓ applied</span>
                      : <button onClick={() => setDraft({ ipoName: i.name, verdictAtApply: i.take?.verdict_key || "", segment: i.segment || null, lots: 1, amount: "", appliedDate: dayISO(new Date()) })}
                          style={{ ...btn(), padding: "4px 8px", fontSize: 10, borderColor: T.brass + "44", color: T.brass }}>Did you apply?</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {draft && (
        <div className="rise" style={{ background: T.raised, border: "1px solid " + T.brass + "44", borderRadius: 11, padding: 14, marginBottom: 14 }}>
          <Label>Log application · {draft.ipoName}</Label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input type="date" value={draft.appliedDate} onChange={e => setDraft(d => ({ ...d, appliedDate: e.target.value }))} style={{ ...inS, width: 140 }} />
            <input type="number" min="1" value={draft.lots} onChange={e => setDraft(d => ({ ...d, lots: e.target.value }))} placeholder="Lots" style={{ ...inS, width: 76 }} />
            <input type="number" step="any" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: e.target.value }))} placeholder="Amount ₹" style={{ ...inS, width: 110 }} />
            <button disabled={busy} onClick={() => { onApply({ ...draft, appliedDate: new Date(draft.appliedDate).toISOString(), lots: +draft.lots || 1, amount: +draft.amount || null }); setDraft(null); }} style={btn(true)}>Log application</button>
            <button onClick={() => setDraft(null)} style={btn()}>Cancel</button>
          </div>
        </div>
      )}

      <Label>Your applications</Label>
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto" }}>
        <table>
          <thead><tr>{["IPO", "Applied", "Lots", "Amount", "Allotted?", "Listing gain", ""].map((h, i) => (
            <th key={h} style={th(i > 2 ? { textAlign: "right" } : {})}>{h.toUpperCase()}</th>))}</tr></thead>
          <tbody>
            {!apps.length && <tr><td colSpan={7} style={td({ textAlign: "center", padding: "18px 8px", color: T.dimSolid })}>
              Nothing logged yet. Record applications as you make them — reconstructing them later is how a track record becomes fiction.</td></tr>}
            {apps.map(a => (
              <tr key={a.id}>
                <td style={td({ fontSize: 12.5, color: T.ink })}>{a.ipoName}
                  {a.verdictAtApply && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.brass, marginLeft: 6 }}>{a.verdictAtApply}</span>}</td>
                <td style={td({ fontFamily: T.mono, fontSize: 10.5 })}>{shortDate(a.appliedDate)}</td>
                <td style={td({ fontFamily: T.mono, fontSize: 11 })}>{a.lots ?? "—"}</td>
                <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11 })}>{inr(a.amount)}</td>
                <td style={td({ textAlign: "right", whiteSpace: "nowrap" })}>
                  {a.allotted == null
                    ? <span style={{ display: "inline-flex", gap: 4 }}>
                        <button onClick={() => onPatch(a.id, { allotted: true })} style={{ ...btn(), padding: "3px 7px", fontSize: 10 }}>yes</button>
                        <button onClick={() => onPatch(a.id, { allotted: false })} style={{ ...btn(), padding: "3px 7px", fontSize: 10 }}>no</button>
                      </span>
                    : <span style={{ fontFamily: T.mono, fontSize: 10.5, color: a.allotted ? T.green : T.dimSolid }}>{a.allotted ? "allotted" : "not allotted"}</span>}
                </td>
                <td style={td({ textAlign: "right" })}>
                  {a.allotted
                    ? <input type="number" step="any" defaultValue={a.listingGainPct ?? ""} placeholder="% gain"
                        onBlur={e => e.target.value !== "" && onPatch(a.id, { listingGainPct: +e.target.value })}
                        style={{ ...inS, width: 80, textAlign: "right" }} />
                    : <span style={{ color: T.dimSolid, fontFamily: T.mono, fontSize: 10.5 }}>—</span>}
                </td>
                <td style={td({ textAlign: "right" })}>
                  <button onClick={() => onDelete(a.id)} style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 11 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stats?.assumptions?.length > 0 && (
        <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.7, marginTop: 10 }}>
          {stats.assumptions.map(a => <div key={a}>· {a}</div>)}
        </div>
      )}
    </div>
  );
}

/* ── view 4: verdict ─────────────────────────────────────────────── */

function VerdictView({ signals, tradeStats, ipoStats, range }) {
  const horizons = useMemo(() => summariseHorizons(signals), [signals]);
  const combos = useMemo(() => byCombo(signals), [signals]);
  const days = daysBetween(range.from, range.to);
  const closed = tradeStats?.trades?.closed ?? 0;
  const resolvedIpos = (ipoStats?.applied ?? 0) - (ipoStats?.pendingAllotment ?? 0);
  const h7 = horizons.ret7d || {};

  // Cost of the decision this module exists to inform, prorated to the window.
  const subCost = Math.round((KITE_MONTHLY / 30) * days);
  const netPaper = (tradeStats?.realisedPnl ?? 0) + (tradeStats?.unrealisedPnl ?? 0);

  const conclusive = closed >= MIN_TRADES;
  const ipoConclusive = resolvedIpos >= MIN_IPOS;

  // Only stated when both sides clear the bar — otherwise it is pattern-matching noise.
  const comboLine = (() => {
    const ranked = combos.filter(c => (c.horizons.ret7d?.n ?? 0) >= MIN_SIGNALS)
      .sort((a, b) => (b.horizons.ret7d.winRate ?? 0) - (a.horizons.ret7d.winRate ?? 0));
    if (ranked.length < 2) return null;
    const [top, next] = ranked;
    return `${top.combo} shows a higher 7-day win rate than ${next.combo} in this sample — ${top.horizons.ret7d.winRate}% (n=${top.horizons.ret7d.n}) vs ${next.horizons.ret7d.winRate}% (n=${next.horizons.ret7d.n}).`;
  })();

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <Stat big label="Signals fired" value={{ text: String(signals.length) }} hint={`${days} days`} />
        <Stat big label="7-day win rate" value={{ text: pctOrThin(h7.winRate, h7.n, MIN_SIGNALS).text }} n={h7.n ?? 0} min={MIN_SIGNALS} />
        <Stat big label="Paper expectancy" value={{ text: inr(tradeStats?.expectancy), color: tone(tradeStats?.expectancy) }} n={closed} min={MIN_TRADES} hint="per trade" />
        <Stat big label="IPO allotment" value={{ text: pctOrThin(ipoStats?.allotmentRate, (ipoStats?.applied ?? 0) - (ipoStats?.pendingAllotment ?? 0), MIN_IPOS).text }}
          n={(ipoStats?.applied ?? 0) - (ipoStats?.pendingAllotment ?? 0)} min={MIN_IPOS} />
      </div>

      {/* The headline is the sample size, not the result. */}
      <div style={{ background: conclusive && ipoConclusive ? T.card : T.amber + "0E",
        border: "1px solid " + (conclusive && ipoConclusive ? T.line : T.amber + "44"), borderRadius: 11, padding: "14px 16px", marginBottom: 14 }}>
        <Label accent={conclusive && ipoConclusive ? T.brass : T.amber}>Can you conclude anything yet?</Label>
        <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.65 }}>
          {!conclusive && (
            <div>Too early to judge the trading side — <span style={{ fontFamily: T.mono, color: T.amber }}>n={closed}</span> closed
              paper trades against a bar of {MIN_TRADES}. Percentages on this few trades are noise wearing a decimal point.</div>
          )}
          {!ipoConclusive && (
            <div style={{ marginTop: !conclusive ? 6 : 0 }}>Too early on IPOs — <span style={{ fontFamily: T.mono, color: T.amber }}>n={resolvedIpos}</span> resolved
              applications against a bar of {MIN_IPOS}.</div>
          )}
          {conclusive && ipoConclusive && (
            <div>Both samples clear the bar set here ({MIN_TRADES} closed trades, {MIN_IPOS} resolved IPOs). That makes the numbers
              worth reading — it does not make them predictive, and one good month is still one month.</div>
          )}
        </div>
      </div>

      <Label>What this suggests</Label>
      <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7, marginBottom: 14 }}>
        {comboLine
          ? <div>· {comboLine}</div>
          : <div>· Not enough matured signals in any two combinations to compare them ({MIN_SIGNALS} each). Nothing is claimed.</div>}
        {tradeStats?.selection?.edgePct != null
          ? <div>· {tradeStats.selection.edgePct > 0
              ? `Your picking is ${signed(tradeStats.selection.edgePct, 1, " pp")} ahead of taking every signal (n=${tradeStats.selection.yourTrades.n} vs ${tradeStats.selection.everySignal.n}).`
              : `Taking every signal beat your picking by ${signed(Math.abs(tradeStats.selection.edgePct), 1, " pp")} (n=${tradeStats.selection.yourTrades.n} vs ${tradeStats.selection.everySignal.n}). The uncomfortable read is that the filtering, not the screener, is the weak link.`}</div>
          : <div>· No comparison between your picks and the raw system yet — both sides need closed trades and matured signals.</div>}
        {h7.n > 0 && (
          <div>· Worst 7-day outcome in the window: <span style={{ color: T.red, fontFamily: T.mono }}>{signed(h7.worst)}</span>, best <span style={{ color: T.green, fontFamily: T.mono }}>{signed(h7.best)}</span>. Both are single signals, not a range you should expect.</div>
        )}
      </div>

      {/* The actual decision */}
      <Label>The Kite decision</Label>
      <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 11, padding: "13px 15px", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7 }}>
          A Kite subscription costs <span style={{ fontFamily: T.mono, color: T.ink }}>{inr(KITE_MONTHLY)}/month</span> — about
          <span style={{ fontFamily: T.mono, color: T.ink }}> {inr(subCost)}</span> over these {days} days.
          On this sample the paper book stands at <span style={{ fontFamily: T.mono, color: tone(netPaper) }}>{inr(netPaper)}</span>
          {" "}({inr(tradeStats?.realisedPnl)} realised, {inr(tradeStats?.unrealisedPnl)} unrealised).
        </div>
        <div style={{ fontSize: 12.5, marginTop: 8, color: T.ink, lineHeight: 1.7 }}>
          {closed === 0
            ? `With no closed trades, the system would have needed to return ${inr(subCost)} over this window just to cover the subscription. Nothing here says whether it can.`
            : netPaper >= subCost
              ? `The book covers the ${inr(subCost)} subscription cost for this window, on paper, with n=${closed} closed trades. Paper is not fills.`
              : `The book is ${inr(subCost - netPaper)} short of the ${inr(subCost)} it would have needed to cover the subscription over this window (n=${closed}).`}
        </div>
        <div style={{ fontSize: 11, color: T.dimSolid, marginTop: 8, lineHeight: 1.6 }}>
          Informational, not advice. Kite also buys live ticks and real order-flow depth, which this screener cannot price;
          the number above only compares a paper P&L to a subscription fee.
        </div>
      </div>

      <div style={{ background: T.red + "0C", border: "1px solid " + T.red + "33", borderRadius: 11, padding: "13px 15px" }}>
        <Label accent={T.red}>Read this before trusting any of it</Label>
        <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7 }}>
          Paper trading excludes slippage, brokerage, STT and the psychology of real money. Live results are typically worse —
          often materially. Entry and exit prices here are the ones you typed, not fills you were guaranteed; signal returns are
          marked from a 15-minute delayed feed. Past behaviour of these signals says nothing reliable about their future
          behaviour, and a sample measured over one market regime tells you about that regime.
        </div>
      </div>
    </div>
  );
}

/* ── shell ───────────────────────────────────────────────────────── */

const VIEWS = [["signals", "Signals"], ["paper", "Paper Trades"], ["ipos", "IPOs"], ["verdict", "Verdict"]];

export default function TrackRecord({ backendUrl, live }) {
  const [range, setRange] = useState(() => ({ preset: 30, ...presetRange(30) }));
  const [view, setView] = useState("signals");
  const [data, setData] = useState({ signals: [], trades: [], apps: [], tradeStats: null, ipoStats: null, sigStats: null, pravesh: null });
  const [state, setState] = useState({ busy: true, err: "" });
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({ symbol: "", entryDate: dayISO(new Date()), entryPrice: "", qty: "", stopLoss: "", target: "", notes: "", signalId: null });

  const api = useMemo(() => (backendUrl ? trackApi(backendUrl) : null), [backendUrl]);
  const days = daysBetween(range.from, range.to);

  const load = useCallback(async () => {
    if (!api) return;
    setState({ busy: true, err: "" });
    const [signals, trades, apps, tradeStats, ipoStats, sigStats, pravesh] = await Promise.all([
      api.signals({ from: range.from, to: range.to }).then(r => r.signals || []).catch(() => []),
      api.trades().then(r => r.trades || []).catch(() => []),
      api.ipos().then(r => r.applications || []).catch(() => []),
      api.tradeStats(days, 7).catch(() => null),
      api.ipoStats(365).catch(() => null),
      api.signalStats(days).catch(() => null),
      fetchPravesh().catch(() => null),
    ]);
    setData({ signals, trades, apps, tradeStats, ipoStats, sigStats, pravesh });
    setState({ busy: false, err: "" });
  }, [api, range.from, range.to, days]);

  useEffect(() => { load(); }, [load]);

  const guard = async (fn) => {
    setState(s => ({ ...s, busy: true }));
    try { await fn(); await load(); }
    catch (e) { setState({ busy: false, err: e.message || "That did not work" }); }
  };

  const submitTrade = () => guard(async () => {
    await api.openTrade({
      symbol: draft.symbol.toUpperCase().trim(), entryDate: new Date(draft.entryDate).toISOString(),
      entryPrice: +draft.entryPrice, qty: +draft.qty,
      stopLoss: draft.stopLoss === "" ? null : +draft.stopLoss,
      target: draft.target === "" ? null : +draft.target,
      notes: draft.notes, signalId: draft.signalId,
    });
    setShowForm(false);
    setDraft({ symbol: "", entryDate: dayISO(new Date()), entryPrice: "", qty: "", stopLoss: "", target: "", notes: "", signalId: null });
  });

  const logFromSignal = (s) => {
    setDraft({
      symbol: s.symbol, entryDate: dayISO(s.firedAt), entryPrice: String(s.price ?? ""), qty: "",
      stopLoss: "", target: "", notes: `Signal ${s.combo} (${s.count}/${s.total}) fired ${shortDate(s.firedAt)}.`, signalId: s.id,
    });
    setShowForm(true);
    setView("paper");
  };

  if (!live) {
    return (
      <div className="track" style={{ fontFamily: T.sans }}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "26px 20px", textAlign: "center" }}>
          <div style={{ margin: "0 auto 12px", width: 34, height: 34, borderRadius: 99, border: "1px solid " + T.line, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <RecordGlyph size={15} color={T.dimSolid} />
          </div>
          <div style={{ fontSize: 13.5, color: T.ink }}>Track Record needs the live backend.</div>
          <div style={{ fontSize: 12, color: T.mute, marginTop: 5, lineHeight: 1.6, maxWidth: 460, margin: "5px auto 0" }}>
            Signals, paper trades and IPO applications are recorded server-side so they survive a refresh and accrue while
            this tab is closed. Demo mode has no history to measure — and inventing one would defeat the point of the module.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="track" style={{ fontFamily: T.sans, color: T.ink }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <RangeBar range={range} setRange={setRange} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, alignItems: "center" }}>
        {VIEWS.map(([k, label]) => (
          <button key={k} onClick={() => setView(k)} style={chip(view === k)}>{label}</button>
        ))}
        <button onClick={load} disabled={state.busy} style={{ ...chip(false), marginLeft: "auto", opacity: state.busy ? .5 : 1 }}>
          {state.busy ? "…" : "↻"}
        </button>
      </div>

      {state.err && (
        <div style={{ marginTop: 12, background: T.red + "10", border: "1px solid " + T.red + "44", borderRadius: 10, padding: "10px 12px", fontSize: 11.5, color: T.mute }}>
          <span style={{ color: T.red }}>{state.err}</span>
        </div>
      )}

      {state.busy && !data.signals.length && !data.trades.length
        ? <div style={{ marginTop: 20, fontSize: 12.5, color: T.dimSolid }}>Reading the record…</div>
        : <>
            {view === "signals" && <SignalsView signals={data.signals} trades={data.trades} onLog={logFromSignal} assumptions={data.sigStats?.assumptions} />}
            {view === "paper" && <PaperView trades={data.trades} stats={data.tradeStats} draft={draft} setDraft={setDraft}
              onSubmit={submitTrade} onPatch={(id, patch) => guard(() => api.patchTrade(id, patch))}
              onDelete={id => guard(() => api.deleteTrade(id))} busy={state.busy} showForm={showForm} setShowForm={setShowForm} />}
            {view === "ipos" && <IpoView pravesh={data.pravesh} apps={data.apps} stats={data.ipoStats} range={range} busy={state.busy}
              onApply={body => guard(() => api.addIpo(body))}
              onPatch={(id, patch) => guard(() => api.patchIpo(id, patch))}
              onDelete={id => guard(() => api.deleteIpo(id))} />}
            {view === "verdict" && <VerdictView signals={data.signals} tradeStats={data.tradeStats} ipoStats={data.ipoStats} range={range} />}
          </>}

      <p style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 24, textAlign: "center" }}>
        Measurement, not prediction. Every percentage here carries its sample size; below the bar this module prints
        &ldquo;insufficient sample&rdquo; rather than a number. <span style={{ color: T.brass }}>The decision stays yours.</span>
      </p>
    </div>
  );
}
