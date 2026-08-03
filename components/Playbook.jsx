"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deskApi, bandLabel, pctText, rupee } from "../lib/desk";

/* ================================================================
   THE PLAYBOOK — where to get in, where it is now, where to get out,
   and what is left. Shapes: trinetra-backend/docs/PLAYBOOK_CONTRACT.md

   Designed for the state it will be in for months, not the state it
   reaches once every ledger fills. Reliability is measured, and
   measurement takes time: broker hit rates need calls to resolve,
   candlestick follow-through needs 8 occurrences in that stock's own
   history. So "not yet measurable" is the normal reading here, printed
   plainly — the temptation this feature exists to resist is filling
   that gap with a textbook number.

   Two rules the rendering enforces rather than documents:
     · a level is a zone. ₹1,268 where the data says ₹1,254–1,281
       invents precision the engine never claimed.
     · convergence: 0 is a finding, not an error. "No methods agree"
       is worth more than a manufactured level.
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C", blue: "#7FA6CE",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
const BAND = { high: T.green, moderate: T.brass, low: T.amber, speculative: T.red };
const chip = a => ({ padding: "5px 10px", borderRadius: 8, border: "1px solid " + (a ? T.brass + "55" : T.line),
  background: a ? T.brassSoft : T.card, color: a ? T.ink : T.mute, fontSize: 11.5, cursor: "pointer" });
const btn = p => ({ padding: "6px 11px", borderRadius: 7, border: "1px solid " + (p ? T.brass : T.line),
  background: p ? T.brass : "transparent", color: p ? "#141206" : T.mute, fontSize: 11.5, fontWeight: p ? 600 : 400, cursor: "pointer" });
const th = x => ({ textAlign: "left", fontFamily: T.mono, fontSize: 9, letterSpacing: 1.1, color: T.dimSolid,
  fontWeight: 400, padding: "7px 8px", borderBottom: "1px solid " + T.line, whiteSpace: "nowrap", ...x });
const td = x => ({ padding: "8px", borderBottom: "1px solid " + T.lineSoft, fontSize: 12, color: T.mute, ...x });
const Label = ({ children, accent }) => (
  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: accent || T.brass, margin: "16px 0 8px", textTransform: "uppercase" }}>{children}</div>
);

/** A level is a band. Never collapse it to a point. */
const zoneText = z => {
  if (!z) return "—";
  const { low, high } = z;
  if (low == null || high == null || low === high) return rupee(low ?? high, 2);
  // On a ₹18 stock, rounding to rupees collapses a real band into "₹18–₹18",
  // which reads as the false precision this whole feature avoids. Keep enough
  // decimals for the two ends to stay distinguishable.
  const d = Math.round(low) === Math.round(high) ? 2 : 0;
  return `${rupee(low, d)}–${rupee(high, d)}`;
};

/** Measured, or explicitly not. "0%" and "unmeasured" are different claims. */
function Reliability({ r }) {
  if (!r || r.rate == null || (r.n ?? 0) < 1) {
    return <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>reliability: not yet measurable</span>;
  }
  return <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.brass }}>{Math.round(r.rate)}% · n={r.n}</span>;
}

function Confidence({ c, compact }) {
  const [open, setOpen] = useState(false);
  if (!c) return <span style={{ color: T.dimSolid, fontSize: 11 }}>—</span>;
  const colour = BAND[String(c.band).toLowerCase()] || T.mute;
  return (
    <span>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ all: "unset", cursor: "pointer", fontFamily: T.mono, fontSize: compact ? 11 : 12.5, color: colour }}>
        {c.score} {bandLabel(c.band)} <span style={{ fontSize: 8.5, color: T.dimSolid }}>{open ? "▴" : "▾"}</span>
      </button>
      {(c.caps || []).length > 0 && !compact && (
        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.amber, marginTop: 3 }}>⚑ {c.caps.join(" · ")}</div>
      )}
      {open && (
        <div style={{ background: T.raised, border: "1px solid " + T.line, borderRadius: 8, padding: "8px 10px", marginTop: 6 }}>
          {(c.components || []).map((x, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "2px 0" }}>
              <span style={{ fontSize: 11, color: T.mute }}>{x.name || x.label}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10.5, color: x.contribution >= 0 ? T.green : T.red }}>
                {x.contribution > 0 ? "+" : ""}{x.contribution}
              </span>
            </div>
          ))}
          {(c.caps || []).map(cap => <div key={cap} style={{ fontSize: 10, color: T.amber, marginTop: 4 }}>⚑ {cap}</div>)}
          {c.summary && <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.6, marginTop: 6 }}>{c.summary}</div>}
          <div style={{ fontSize: 10, color: T.dimSolid, marginTop: 6, lineHeight: 1.5 }}>
            This measures how many independent methods agree — not whether the trade will work.
          </div>
        </div>
      )}
    </span>
  );
}

/* Convergence is the whole thesis of the feature, including when it is zero. */
function Convergence({ n, spread, zone }) {
  if (n == null) return null;
  if (n === 0) {
    return (
      <div style={{ background: T.amber + "12", border: "1px solid " + T.amber + "44", borderRadius: 9, padding: "10px 12px", fontSize: 12.5, color: T.amber, lineHeight: 1.6 }}>
        No methods agree here{spread ? ` — candidate levels scatter from ${rupee(spread.low, 0)} to ${rupee(spread.high, 0)}` : ""}. There is no reliable level to act on, which is itself the finding.
      </div>
    );
  }
  return (
    <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.6 }}>
      <span style={{ color: T.brass, fontFamily: T.mono }}>{n}</span> independent method{n === 1 ? "" : "s"} agree
      {zone ? <> within <span style={{ fontFamily: T.mono, color: T.ink }}>{zoneText(zone)}</span></> : null}
      {n === 1 && <span style={{ color: T.dimSolid }}> — one method is a candidate, not a confluence.</span>}
    </div>
  );
}

/* Supporting and opposing at the same visual weight. A one-sided list is
   marketing, not evidence. */
function EvidenceStack({ items }) {
  if (!items?.length) {
    return <div style={{ fontSize: 11.5, color: T.dimSolid, lineHeight: 1.6 }}>No evidence recorded for this level yet.</div>;
  }
  const groups = items.reduce((a, e) => { (a[e.source || "Other"] ||= []).push(e); return a; }, {});
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Object.entries(groups).map(([source, list]) => (
        <div key={source}>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1, color: T.dimSolid, marginBottom: 5 }}>{source.toUpperCase()}</div>
          {list.map((e, i) => {
            const opposes = e.stance === "opposes";
            return (
              <div key={i} style={{ background: T.card, borderLeft: "3px solid " + (opposes ? T.red : T.green),
                border: "1px solid " + T.line, borderRadius: 8, padding: "9px 11px", marginBottom: 5 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: opposes ? T.red : T.green }}>
                    {opposes ? "OPPOSES" : "SUPPORTS"}
                  </span>
                  <span style={{ fontSize: 12.5, color: T.ink }}>{e.name}</span>
                  {e.url && (
                    <a href={e.url} target="_blank" rel="noreferrer" onClick={ev => ev.stopPropagation()}
                      style={{ fontFamily: T.mono, fontSize: 9.5, color: T.blue, textDecoration: "none" }}>source ↗</a>
                  )}
                </div>
                {e.detail && <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 4 }}>{e.detail}</div>}
                <div style={{ marginTop: 4 }}><Reliability r={e.reliability} /></div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/* The whole trade on one scale: stop | entry | now | safe | primary | stretch. */
function RangeBar({ pb, compact }) {
  const stop = pb.exits?.stop?.zone, entry = pb.entry?.zone;
  const pts = [
    stop && ["stop", (stop.low + stop.high) / 2, T.red],
    entry && ["entry", (entry.low + entry.high) / 2, T.brass],
    ["now", pb.price, T.ink],
    pb.exits?.safe?.zone && ["safe", (pb.exits.safe.zone.low + pb.exits.safe.zone.high) / 2, T.green],
    pb.exits?.primary?.zone && ["primary", (pb.exits.primary.zone.low + pb.exits.primary.zone.high) / 2, T.brass],
    pb.exits?.stretch?.zone && ["stretch", (pb.exits.stretch.zone.low + pb.exits.stretch.zone.high) / 2, T.blue],
  ].filter(Boolean);
  if (pts.length < 2) return null;
  const vals = pts.map(p => p[1]).filter(Number.isFinite);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const at = v => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  return (
    <div style={{ position: "relative", height: compact ? 14 : 30, marginTop: compact ? 2 : 8 }}>
      <div style={{ position: "absolute", top: compact ? 6 : 13, left: 0, right: 0, height: 2, background: T.lineSoft, borderRadius: 2 }} />
      {pts.map(([name, v, colour]) => (
        <div key={name} title={`${name} ${rupee(v, 0)}`}
          style={{ position: "absolute", top: compact ? 2 : 8, left: `calc(${at(v)}% - ${name === "now" ? 1 : 3}px)`,
            width: name === "now" ? 2 : 6, height: compact ? 10 : 12, borderRadius: 2, background: colour }} />
      ))}
    </div>
  );
}

const STATES = {
  waiting:    { label: "below entry", colour: T.dimSolid },
  actionable: { label: "in entry zone", colour: T.green },
  running:    { label: "running", colour: T.brass },
  exhausted:  { label: "at/beyond target", colour: T.amber },
};
function stateOf(r) {
  const z = r.entry?.zone, p = r.price, primary = r.exits?.primary?.zone;
  if (primary && p >= (primary.low ?? Infinity)) return "exhausted";
  if (z && p < (z.low ?? -Infinity)) return "waiting";
  if (z && p >= z.low && p <= z.high) return "actionable";
  return "running";
}

/* ── detail ──────────────────────────────────────────────────────── */
function Detail({ pb, onHold, held, busy }) {
  const p = pb.potential || {};
  const big = (label, value, sub, colour) => (
    <div style={{ flex: "1 1 150px", background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "11px 13px" }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1, color: T.dimSolid }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: 15, color: colour || T.ink, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      {pb.reading && <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.7, marginBottom: 12 }}>{pb.reading}</div>}

      {/* the chase warning outranks the numbers — it changes what they mean */}
      {pb.entry?.chasing && (
        <div style={{ background: T.red + "12", border: "1px solid " + T.red + "55", borderLeft: "3px solid " + T.red,
          borderRadius: 9, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: T.red, lineHeight: 1.6 }}>
          Price is {pctText(pb.entry.movedAlreadyPct)} past the trigger{pb.entry.chaseRiskPct != null ? ` — more than 1× ATR` : ""}.
          Entering here changes the risk-reward materially against you.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {big("Entry zone", zoneText(pb.entry?.zone), pb.entry?.kind)}
        {big("Current", rupee(pb.price, 0), pb.entry?.movedAlreadyPct != null ? `${pctText(pb.entry.movedAlreadyPct)} vs trigger` : null)}
        {big("Primary exit", zoneText(pb.exits?.primary?.zone), pb.exits?.primary?.anchor)}
        {big("Left to primary", p.toPrimaryPct != null ? pctText(p.toPrimaryPct) : "—",
          p.exhausted ? "typical move already spent" : null, p.exhausted ? T.amber : T.green)}
      </div>

      <RangeBar pb={pb} />
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <span style={{ color: T.red }}>▍stop {zoneText(pb.exits?.stop?.zone)}</span>
        <span style={{ color: T.brass }}>▍entry {zoneText(pb.entry?.zone)}</span>
        <span style={{ color: T.ink }}>▍now {rupee(pb.price, 0)}</span>
        <span style={{ color: T.green }}>▍safe {zoneText(pb.exits?.safe?.zone)}</span>
        <span style={{ color: T.brass }}>▍primary {zoneText(pb.exits?.primary?.zone)}</span>
        <span style={{ color: T.blue }}>▍stretch {zoneText(pb.exits?.stretch?.zone)}</span>
      </div>

      <Label>Entry · confidence</Label>
      <Confidence c={pb.entry?.confidence} />
      <div style={{ marginTop: 8 }}>
        <Convergence n={pb.entry?.convergence} zone={pb.entry?.zone} spread={pb.entry?.spread} />
      </div>
      {(pb.entry?.anchors || []).length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 6, lineHeight: 1.7 }}>
          {pb.entry.anchors.map(a => <div key={a.name}>· {rupee(a.price, 0)} — {a.name}{a.type ? ` (${a.type})` : ""}</div>)}
        </div>
      )}
      <div style={{ marginTop: 10 }}><EvidenceStack items={pb.entry?.evidence} /></div>

      <Label>Exits · confidence</Label>
      <Confidence c={pb.exits?.confidence} />
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
        {["safe", "primary", "stretch"].map(k => {
          const e = pb.exits?.[k]; if (!e) return null;
          const rr = pb.exits?.riskReward?.[`to${k[0].toUpperCase()}${k.slice(1)}`];
          const poor = rr != null && rr < 1;
          return (
            <div key={k} style={{ background: T.card, border: "1px solid " + (poor ? T.red + "55" : T.line), borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, minWidth: 52 }}>{k.toUpperCase()}</span>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{zoneText(e.zone)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.green }}>{pctText(e.pct)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>{e.convergence != null ? `${e.convergence} agree` : ""}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10.5, color: poor ? T.red : T.dimSolid, marginLeft: "auto" }}>
                  {rr != null ? `R:R ${(+rr).toFixed(1)}${poor ? " · risk exceeds reward" : ""}` : ""}
                </span>
              </div>
              {e.anchor && <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>{e.anchor}</div>}
              {e.evidence?.length > 0 && <div style={{ marginTop: 7 }}><EvidenceStack items={e.evidence} /></div>}
            </div>
          );
        })}
        {pb.exits?.stop && (
          <div style={{ background: T.card, border: "1px solid " + T.red + "44", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.red, minWidth: 52 }}>INVALIDATION</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{zoneText(pb.exits.stop.zone)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.red }}>{pctText(pb.exits.stop.pct)}</span>
            </div>
            <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>{pb.exits.stop.anchor} — {pb.exits.stop.rationale}</div>
          </div>
        )}
      </div>
      {pb.exits?.riskRewardWarning && (
        <div style={{ fontSize: 11.5, color: T.red, marginTop: 8 }}>⚠ {pb.exits.riskRewardWarning}</div>
      )}

      {/* Candles are cross-verification. Said once, plainly. */}
      <Label>Candlestick reading</Label>
      <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.55, marginBottom: 8 }}>
        Patterns confirm or contradict a level — they are not a reason on their own. Follow-through is measured from this
        stock&apos;s own history, not a textbook table.
      </div>
      {(() => {
        const all = pb.candles?.detected || [];
        const valid = all.filter(c => c.contextValid !== false);
        const contextless = all.filter(c => c.contextValid === false);
        if (!all.length) return <div style={{ fontSize: 11.5, color: T.dimSolid }}>No patterns detected in the recent window.</div>;
        return (
          <>
            {valid.map((c, i) => (
              <div key={i} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 8, padding: "9px 11px", marginBottom: 5 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ fontSize: 12.5, color: T.ink }}>{c.name}</span>
                  {c.at != null && <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid }}>at {rupee(c.at, 0)}</span>}
                  {c.volumeConfirmed != null && (
                    <span style={{ fontFamily: T.mono, fontSize: 9.5, color: c.volumeConfirmed ? T.green : T.dimSolid }}>
                      {c.volumeConfirmed ? "volume confirmed" : "no volume confirmation"}
                    </span>
                  )}
                </div>
                {c.reading && <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 4 }}>{c.reading}</div>}
                <div style={{ marginTop: 4 }}>
                  <Reliability r={c.followThrough} />
                  {c.followThrough?.n != null && c.followThrough.rate != null && (
                    <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}> · this stock, {c.followThrough.n} occurrences</span>
                  )}
                </div>
              </div>
            ))}
            {contextless.length > 0 && (
              <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 6, lineHeight: 1.55 }}>
                Patterns without context (not counted as evidence): {contextless.map(c => c.name).join(", ")}.
              </div>
            )}
          </>
        );
      })()}

      <Label>Broker calls</Label>
      {pb.analysts?.unavailable ? (
        <div style={{ fontSize: 11.5, color: T.amber, lineHeight: 1.6 }}>
          Broker data unavailable right now — the scrape failed or was rate-limited. The levels above stand on technical
          and candlestick evidence alone; nothing here is inferred from a missing source.
        </div>
      ) : (pb.analysts?.calls || []).length ? (
        <>
          {pb.analysts.consensusTarget != null && (
            <div style={{ fontFamily: T.mono, fontSize: 11, color: T.mute, marginBottom: 6 }}>
              consensus {rupee(pb.analysts.consensusTarget, 0)} · n={pb.analysts.n ?? pb.analysts.calls.length}
            </div>
          )}
          {pb.analysts.calls.map((c, i) => (
            <div key={i} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 8, padding: "8px 10px", marginBottom: 5 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontSize: 12.5, color: T.ink }}>{c.broker}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.brass }}>{rupee(c.target, 0)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>{c.date}</span>
                {c.url && <a href={c.url} target="_blank" rel="noreferrer" style={{ fontFamily: T.mono, fontSize: 9.5, color: T.blue, textDecoration: "none" }}>source ↗</a>}
              </div>
              <div style={{ marginTop: 4 }}><Reliability r={c.hitRate} /></div>
            </div>
          ))}
        </>
      ) : (
        <div style={{ fontSize: 11.5, color: T.dimSolid }}>No broker calls recorded for this symbol.</div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        {held
          ? <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.green }}>✓ marked as a holding</span>
          : <button onClick={() => onHold(pb.symbol)} disabled={busy} style={btn(true)}>I&apos;m holding this</button>}
        <span style={{ fontSize: 10.5, color: T.dimSolid }}>
          Marking it starts the exit rules against the invalidation level above.
        </span>
      </div>

      {pb.dataAge?.delayed && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.amber, marginTop: 10 }}>
          ⏱ ~{Math.round((pb.dataAge.lagSeconds || 900) / 60)} min delayed — part of any move may already be gone.
        </div>
      )}
    </div>
  );
}

/* ── shell ───────────────────────────────────────────────────────── */
const SORTS = [
  ["potential", "Potential left"], ["entryConf", "Entry confidence"], ["exitConf", "Exit confidence"],
  ["convergence", "Convergence"], ["distance", "Distance to entry"], ["symbol", "Symbol"],
];

export default function Playbook({ backendUrl, live, profileId, held, onHold, holdBusy }) {
  const api = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);
  const profile = profileId && profileId !== "ALL" ? profileId : "swing";
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState({ key: "potential", dir: "desc" });
  const [stateFilter, setStateFilter] = useState("");

  const load = useCallback(async () => {
    if (!api) return;
    setErr("");
    try { const j = await api.playbookAll(profile); setRows(j?.rows || j?.playbooks || []); }
    catch (e) { setRows(null); setErr(e.message || "unavailable"); }
  }, [api, profile]);
  useEffect(() => { load(); }, [load]);

  const openRow = async (symbol) => {
    if (open === symbol) { setOpen(null); return; }
    setOpen(symbol); setDetail(null);
    try { setDetail(await api.playbook({ symbol, profile })); }
    catch (e) { setDetail({ error: e.message }); }
  };

  if (!live) {
    return <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "24px 20px", textAlign: "center", fontFamily: T.sans }}>
      <div style={{ fontSize: 13.5, color: T.ink }}>The Playbook needs the live backend.</div>
      <div style={{ fontSize: 12, color: T.mute, marginTop: 5, lineHeight: 1.6 }}>
        Levels are clustered server-side from independent methods; there is nothing to cluster in demo.
      </div>
    </div>;
  }

  if (err) {
    return <div style={{ fontFamily: T.sans }}>
      <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "22px 18px" }}>
        <div style={{ fontSize: 13.5, color: T.ink }}>The Playbook is not available from this backend yet.</div>
        <div style={{ fontSize: 12, color: T.mute, marginTop: 6, lineHeight: 1.65 }}>
          It needs the levels and pattern engines, which are still being built. Everything else in the app is unaffected.
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 8 }}>/playbook/all — {err}</div>
      </div>
    </div>;
  }

  const list = (rows || []).filter(r => !stateFilter || stateOf(r) === stateFilter);
  const val = r => sort.key === "potential" ? r.potential?.toPrimaryPct
    : sort.key === "entryConf" ? r.entry?.confidence?.score
    : sort.key === "exitConf" ? (r.exits?.confidence?.score ?? r.exitConfidence)
    : sort.key === "convergence" ? (r.convergence ?? r.entry?.convergence)
    : sort.key === "distance" ? (r.entry?.zone?.low != null && r.price != null ? Math.abs(r.entry.zone.low - r.price) / r.price : null)
    : null;
  const sorted = [...list].sort((a, b) => {
    if (sort.key === "symbol") return a.symbol.localeCompare(b.symbol);
    const av = val(a), bv = val(b);
    if (av == null && bv == null) return a.symbol.localeCompare(b.symbol);
    if (av == null) return 1;            // unmeasured sorts last, never as zero
    if (bv == null) return -1;
    return sort.dir === "asc" ? av - bv : bv - av;
  });

  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 10 }}>
        Where to get in, where it is now, where to get out — each level clustered from independent methods.
        <span style={{ color: T.dimSolid }}> Confidence measures how many methods agree, not whether the trade works.</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <select value={sort.key} onChange={e => setSort(s => ({ ...s, key: e.target.value }))}
          style={{ background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px" }}>
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button onClick={() => setSort(s => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))} style={btn()}>{sort.dir === "asc" ? "▲" : "▼"}</button>
        {Object.entries(STATES).map(([k, v]) => (
          <button key={k} onClick={() => setStateFilter(f => (f === k ? "" : k))} style={chip(stateFilter === k)}>{v.label}</button>
        ))}
        <button onClick={load} style={{ ...btn(), marginLeft: "auto" }}>↻</button>
      </div>

      {!rows ? <div style={{ fontSize: 12.5, color: T.dimSolid }}>Reading the playbook…</div>
        : !sorted.length ? <div style={{ border: "1px dashed " + T.line, borderRadius: 10, padding: "18px 14px", fontSize: 12, color: T.dimSolid }}>
            No symbols match this filter.
          </div>
        : (
        <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: 6, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              {["Symbol", "Entry zone", "Current", "Primary exit", "Left", "Entry", "Exit", "Agree", "Reading"].map((h, i) => (
                <th key={h} style={th(i > 1 && i < 8 ? { textAlign: "right" } : {})}>{h.toUpperCase()}</th>))}
            </tr></thead>
            <tbody>
              {sorted.map(r => {
                const st = STATES[stateOf(r)];
                const conv = r.convergence ?? r.entry?.convergence;
                return (
                  <React.Fragment key={r.symbol}>
                    <tr onClick={() => openRow(r.symbol)} style={{ cursor: "pointer" }}>
                      <td style={td({ fontFamily: T.mono, fontSize: 12, color: T.ink, whiteSpace: "nowrap" })}>
                        {r.symbol}
                        <div style={{ fontFamily: T.mono, fontSize: 8.5, color: st.colour }}>{st.label}</div>
                      </td>
                      <td style={td({ fontFamily: T.mono, fontSize: 11, whiteSpace: "nowrap" })}>{zoneText(r.entry?.zone)}</td>
                      <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: T.ink })}>{rupee(r.price, 0)}</td>
                      <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, whiteSpace: "nowrap" })}>{zoneText(r.exits?.primary?.zone)}</td>
                      <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: r.potential?.exhausted ? T.amber : T.green })}>
                        {r.potential?.toPrimaryPct != null ? pctText(r.potential.toPrimaryPct) : "—"}
                      </td>
                      <td style={td({ textAlign: "right" })}><Confidence c={r.entry?.confidence} compact /></td>
                      <td style={td({ textAlign: "right" })}><Confidence c={r.exits?.confidence} compact /></td>
                      <td style={td({ textAlign: "right", fontFamily: T.mono, fontSize: 11, color: conv === 0 ? T.amber : T.brass })}>
                        {conv == null ? "—" : conv}
                      </td>
                      <td style={td({ fontSize: 11.5, minWidth: 180 })}>
                        {r.reading || "—"}
                        <RangeBar pb={r} compact />
                      </td>
                    </tr>
                    {open === r.symbol && (
                      <tr><td colSpan={9} style={{ padding: "12px 10px", background: T.bg, borderBottom: "1px solid " + T.line }}>
                        {!detail ? <span style={{ fontSize: 12, color: T.dimSolid }}>Reading the evidence…</span>
                          : detail.error ? <span style={{ fontSize: 12, color: T.amber }}>Could not load the detail — {detail.error}</span>
                          : <Detail pb={detail} held={held?.has(r.symbol)} busy={holdBusy === r.symbol} onHold={onHold} />}
                      </td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 16, textAlign: "center" }}>
        Reliability figures are measured, and measurement takes months — &ldquo;not yet measurable&rdquo; is the honest
        reading, not a gap. <span style={{ color: T.brass }}>The call is yours.</span>
      </p>
    </div>
  );
}
