"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deskApi, bandLabel, pctText, rupee, noRoomOf, withheldOf } from "../lib/desk";
import DataTable from "./DataTable";
import { RiskNote, ShortabilityChip, ShortabilityBlock, LotNote, isShort, DEFAULT_RISK_NOTE } from "./Shortability";

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
  // insufficient means "we counted, and it is too few" — show the count, not a rate.
  if (r?.insufficient) {
    return <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>insufficient history · n={r.n ?? 0}</span>;
  }
  if (!r || r.rate == null || (r.n ?? 0) < 1) {
    return <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>reliability: not yet measurable</span>;
  }
  return <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.brass }}>{Math.round(r.rate)}% · n={r.n}</span>;
}

function Confidence({ c, compact, onExpand }) {
  const [open, setOpen] = useState(false);
  if (!c) return <span style={{ color: T.dimSolid, fontSize: 11 }}>—</span>;
  const colour = BAND[String(c.band).toLowerCase()] || T.mute;
  return (
    <span>
      <button onClick={e => { if (compact && onExpand) { e.stopPropagation(); onExpand(); return; } e.stopPropagation(); setOpen(o => !o); }}
        style={{ all: "unset", cursor: "pointer", fontFamily: T.mono, fontSize: compact ? 11 : 12.5, color: colour }}>
        {c.score} {bandLabel(c.band)} <span style={{ fontSize: 8.5, color: T.dimSolid }}>{compact ? "why?" : (open ? "▴" : "▾")}</span>
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
function Convergence({ n, spread, zone, families }) {
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
      {families?.length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 4 }}>
          {families.join(" · ")}
        </div>
      )}
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
  const stop = ex(pb, "stop")?.zone, entry = pb.entry?.zone;
  const pts = [
    stop && ["stop", (stop.low + stop.high) / 2, T.red],
    entry && ["entry", (entry.low + entry.high) / 2, T.brass],
    ["now", pb.price, T.ink],
    ex(pb, "safe")?.zone && ["safe", (ex(pb, "safe").zone.low + ex(pb, "safe").zone.high) / 2, T.green],
    ex(pb, "primary")?.zone && ["primary", (ex(pb, "primary").zone.low + ex(pb, "primary").zone.high) / 2, T.brass],
    ex(pb, "stretch")?.zone && ["stretch", (ex(pb, "stretch").zone.low + ex(pb, "stretch").zone.high) / 2, T.blue],
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

/* /playbook/all returns a flatter row than /playbook: primary, stop, riskReward
   and exitConfidence sit at the top level there and under `exits` here. Read
   both rather than rendering "—" against a payload that has the number. */
const ex = (r, k) => r?.exits?.[k] ?? r?.[k];
const exitConf = r => r?.exits?.confidence ?? r?.exitConfidence;
const rrOf = r => r?.exits?.riskReward ?? r?.riskReward;

/* HORIZON_SESSIONS in plain units. Sessions are the engine's unit; "3–5 days"
   is the one a person plans around. */
/* A sell captures a fall. Printing its pct (-5.5%) reads as a loss, and calling
   it upside is simply wrong — so magnitude plus a direction arrow, always from
   the payload, never inferred from the sign. */
/* A target that was computed and rejected. Rendered wherever a target would
   have gone, at the weight of the finding it is — the row is not missing a
   number, it is carrying a conclusion. */
const NoTargetCell = ({ r, small }) => (
  <span title={r.exits?.riskRewardWarning || r.riskRewardWarning
    || "A target was computed and rejected for sitting closer than the stop."}
    style={{ color: T.red, fontSize: small ? 10 : 12, fontFamily: T.mono }}>
    no target offered
  </span>
);

function moveText(level, direction) {
  if (!level) return "—";
  const down = level.downward ?? (direction === "sell");
  const mag = level.movePct != null ? level.movePct : (level.pct != null ? Math.abs(level.pct) : null);
  if (mag == null) return "—";
  return `${(+mag).toFixed(1)}% ${down ? "▼" : "▲"}`;
}
const moveColour = (level, direction) =>
  ((level?.downward ?? (direction === "sell")) ? T.blue : T.green);

const TIMEFRAME = {
  intraday:   "today",
  swing:      "3–5 days",
  positional: "2–4 weeks",
  longterm:   "3+ months",
};

/* The timeframe of a row is the horizon of the profile it actually locked
   under — not the profile that was asked for. Reading r.horizon made every row
   echo ?profile=swing back as "3–5 days", including the 279 of 303 that had not
   locked under anything at all. A row with no lock has no timeframe of its own,
   and a dash says that; inventing one dresses a non-signal as a swing trade. */
const timeframeOf = (r) => {
  /* A clamped short overrides everything else. The server shortened the horizon
     because the trade cannot be held longer; showing where it locked would
     describe a position that cannot be placed. */
  const c = r?.horizonClamped;
  if (c?.to) return (TIMEFRAME[c.to] || c.to) + " (clamped)";
  const locks = r?.lockedUnder || [];
  if (!locks.length) return "—";
  const seen = [...new Set(locks.map(l => TIMEFRAME[l.horizon] || l.horizon).filter(Boolean))];
  return seen.length ? seen.join(" · ") : "—";
};

/* A plan whose targets sit below its own entry trigger is not a plan: enter
   where it says and you are underwater at the target by construction. The
   percentages that make it look fine are measured from today's price, which is
   a different trade from the one the entry rule defines. Say so rather than
   render the tidy number. */
/* Direction decides what "incoherent" even means. On a long, a target under the
   entry is unbuyable. On a short it is the trade: sell at 413, cover at 405.
   Read direction-blind, this fired on every short and branded correct plans
   un-takeable — the inverse of the error it exists to catch. */
function incoherence(r) {
  const entry = r?.entry?.zone, primary = ex(r, "primary")?.zone;
  if (!entry || !primary || r?.entry?.triggered) return null;
  if (isShort(r)) {
    // A short is broken when the cover sits ABOVE where you sold.
    if (primary.low != null && entry.high != null && primary.low >= entry.high) {
      return { kind: "cover-above-entry", entryHigh: entry.high, primaryLow: primary.low };
    }
    return null;
  }
  if (primary.high != null && entry.low != null && primary.high <= entry.low) {
    return { kind: "targets-below-entry", entryLow: entry.low, primaryHigh: primary.high };
  }
  return null;
}

const STATES = {
  waiting:    { label: "below entry", colour: T.dimSolid },
  actionable: { label: "in entry zone", colour: T.green },
  running:    { label: "running", colour: T.brass },
  exhausted:  { label: "at/beyond target", colour: T.amber },
};
/* Every comparison here inverts on a short: the entry sits ABOVE the price you
   want and the target BELOW it, so "past the target" is a fall, not a rise.
   Read long-side, a short that had already run to its cover level was reported
   as still waiting to be entered — the most expensive way to be wrong, since it
   invites entering a move that is over. */
function stateOf(r) {
  const z = r.entry?.zone, p = r.price, primary = ex(r, "primary")?.zone;
  if (p == null) return "waiting";
  if (isShort(r)) {
    if (primary && p <= (primary.high ?? -Infinity)) return "exhausted";
    if (z && z.high != null && p > z.high) return "waiting";   // not yet risen to the sell zone
    if (z && z.low != null && z.high != null && p >= z.low && p <= z.high) return "actionable";
    return "running";
  }
  if (primary && p >= (primary.low ?? Infinity)) return "exhausted";
  if (z && p < (z.low ?? -Infinity)) return "waiting";
  if (z && p >= z.low && p <= z.high) return "actionable";
  return "running";
}

/* ── detail ──────────────────────────────────────────────────────── */
/* Scraping moneycontrol and trendlyne is blocked, so a broker target only
   exists here if someone types it. It is worth typing: a target inside a zone
   raises that zone's convergence, which is the whole scoring mechanism. */
function AddBrokerCall({ symbol, onAdd }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ broker: "", target: "", call: "buy", date: "" });
  const [msg, setMsg] = useState("");
  const inS = { background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px" };
  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        <button onClick={() => setOpen(true)} style={{ ...btn(), fontSize: 11 }}>+ Add a broker call</button>
        <span style={{ fontSize: 10.5, color: T.dimSolid, marginLeft: 8 }}>
          Scraping is blocked, so brokers only appear here if you enter them — and a target inside a zone lifts its convergence.
        </span>
      </div>
    );
  }
  return (
    <div style={{ background: T.raised, border: "1px solid " + T.brass + "44", borderRadius: 9, padding: "10px 12px", marginTop: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input value={f.broker} onChange={e => setF({ ...f, broker: e.target.value })} placeholder="Broker" style={{ ...inS, flex: "1 1 150px" }} />
        <input value={f.target} onChange={e => setF({ ...f, target: e.target.value })} type="number" step="any" placeholder="Target ₹" style={{ ...inS, width: 100 }} />
        <select value={f.call} onChange={e => setF({ ...f, call: e.target.value })} style={inS}>
          <option value="buy">buy</option><option value="hold">hold</option><option value="sell">sell</option>
        </select>
        <input value={f.date} onChange={e => setF({ ...f, date: e.target.value })} type="date" style={inS} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
        <button disabled={!f.broker.trim()} style={{ ...btn(true), opacity: f.broker.trim() ? 1 : .4 }}
          onClick={async () => {
            try {
              await onAdd({ symbol, broker: f.broker.trim(), target: f.target === "" ? null : +f.target, call: f.call, date: f.date || undefined });
              setMsg("Added — it will move the levels on the next read."); setF({ broker: "", target: "", call: "buy", date: "" });
            } catch (e) { setMsg(e.message || "Could not add it"); }
          }}>Add call</button>
        <button onClick={() => { setOpen(false); setMsg(""); }} style={btn()}>Close</button>
        {msg && <span style={{ fontSize: 10.5, color: /could not/i.test(msg) ? T.red : T.green }}>{msg}</span>}
      </div>
    </div>
  );
}

function Detail({ pb, onHold, held, busy, onAddCall, shortability }) {
  const p = pb.potential || {};
  const noRoom = noRoomOf(pb);
  const withheld = withheldOf(pb);
  /* Top level on the detail payload, under `potential` on a list row — read
     both, because a missing basis silently re-measures every percentage
     against spot. */
  const basisPrice = pb.basisPrice ?? p.basisPrice ?? null;
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

      {(() => {
        const bad = incoherence(pb);
        if (!bad) return null;
        return (
          <div style={{ background: T.red + "12", border: "1px solid " + T.red + "55", borderLeft: "3px solid " + T.red,
            borderRadius: 9, padding: "11px 13px", marginBottom: 12, fontSize: 12.5, color: T.red, lineHeight: 1.65 }}>
            These levels do not describe a takeable trade. The entry only qualifies above {rupee(bad.entryLow, 0)},
            but every target sits below it — the highest is {rupee(bad.primaryHigh, 0)}. Entering where the rule says
            would put you under the target from the start. The percentage and risk-reward shown below are measured from
            today&apos;s price, which is a different trade from the one this entry defines.
          </div>
        );
      })()}

      {/* The percentages and the risk-reward are measured from the price you
          would actually pay, which is not today's price on an untriggered
          setup. Measuring from spot is what made these look attractive when
          they were not, so the basis is stated rather than assumed. */}
      {basisPrice != null && (
        <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginBottom: 8 }}>
          measured from {rupee(basisPrice, 0)}{pb.basis || p.basis ? ` · ${pb.basis || p.basis}` : ""}
          {!noRoom && pb.potential?.fromSpotToPrimaryPct != null && (
            <> · {pctText(pb.potential.fromSpotToPrimaryPct)} away from today&apos;s price, which is distance, not the trade&apos;s potential</>
          )}
        </div>
      )}

      {/* What the row is actually proposing. The rest of the app names its
          actions; this screen should not be the one that leaves it implied. */}
      <div style={{ fontSize: 11.5, color: T.dimSolid, lineHeight: 1.55, marginBottom: 10 }}>
        {pb.entry?.triggered
          ? "Entry setup — the trigger has been met; consider entering within the zone."
          : `Entry setup — not yet valid. Consider entering only above ${rupee(pb.entry?.zone?.high ?? pb.entry?.zone?.low, 0)}.`}
        {" "}Never an instruction; the call is yours.
      </div>

      {/* On a short this outranks even the chase warning: chasing changes the
          risk-reward, an unbounded downside changes what losing means. */}
      {isShort(pb) && <RiskNote text={pb.riskNote} />}

      {/* the chase warning outranks the numbers — it changes what they mean */}
      {pb.entry?.chasing && (
        <div style={{ background: T.red + "12", border: "1px solid " + T.red + "55", borderLeft: "3px solid " + T.red,
          borderRadius: 9, padding: "10px 12px", marginBottom: 12, fontSize: 12.5, color: T.red, lineHeight: 1.6 }}>
          {pb.entry.warning
            || `Price is ${pctText(pb.entry.movedAlreadyPct)} past the trigger. Entering here changes the risk-reward materially against you.`}
        </div>
      )}

      {/* Beside the numbers, not under them: a signal can lock cleanly and
          still be a bad bet, and on a short the losing side is unbounded. */}
      {/* On noRoom this same sentence IS the finding, so it gets the heading
          that says which of the two empty-target states this is. The other
          state — no estimate at all — must never render this copy. */}
      {(pb.riskRewardWarning || pb.exits?.riskRewardWarning) && (
        <div style={{ background: T.red + "12", border: "1px solid " + T.red + "55", borderLeft: "3px solid " + T.red,
          borderRadius: 9, padding: "10px 12px", marginBottom: 10 }}>
          {noRoom && (
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.red, marginBottom: 5 }}>NO TARGET OFFERED</div>
          )}
          <div style={{ fontSize: 12.5, color: T.red, lineHeight: 1.6 }}>
            {pb.riskRewardWarning || pb.exits?.riskRewardWarning}
          </div>
          {noRoom && (
            <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.55, marginTop: 6 }}>
              A target was computed and rejected, not missing. The invalidation level below still stands.
            </div>
          )}
          {noRoom && withheld && (
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 5, lineHeight: 1.6 }}>
              rejected: {["safe", "primary", "stretch"].filter(k => withheld[k] != null)
                .map(k => `${k} ${rupee(withheld[k], 0)}`).join(" · ")}
              {" — "}{withheld.why || "below 1:1 against the stop"}. Shown for inspection, not to act on.
            </div>
          )}
        </div>
      )}
      {isShort(pb) && <ShortabilityBlock s={shortability || pb.shortability} clamped={pb.horizonClamped} />}
      {isShort(pb) && <LotNote s={shortability || pb.shortability} />}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {big(pb.actionLabel || pb.exits?.actionLabel || "Entry zone", zoneText(pb.entry?.zone), pb.entry?.kind)}
        {big("Current", rupee(pb.price, 0), pb.entry?.movedAlreadyPct != null ? `${pctText(pb.entry.movedAlreadyPct)} vs trigger` : null)}
        {/* Both of these fall back to `potential.toPrimaryPct` when the level
            object is absent — and on noRoom that percentage still describes the
            REJECTED target. Substituting it here is the same promotion the
            backend removed from the price. */}
        {noRoom
          ? big(pb.targetLabel || pb.exits?.targetLabel || "Primary exit", "none", "computed and rejected", T.red)
          : big(pb.targetLabel || pb.exits?.targetLabel || "Primary exit", zoneText(ex(pb, "primary")?.zone), ex(pb, "primary")?.anchor)}
        {noRoom
          ? big(pb.direction === "sell" ? "Capture" : "Left to target", "—", "less to gain than to lose on any exit plan", T.red)
          : big(pb.direction === "sell" ? "Capture" : "Left to target",
              moveText(ex(pb, "primary") || { movePct: p.toPrimaryPct }, pb.direction),
              p.exhausted ? "typical move already spent" : (pb.direction === "sell" ? "the fall you would capture" : null),
              p.exhausted ? T.amber : moveColour(ex(pb, "primary"), pb.direction))}
      </div>

      <RangeBar pb={pb} />
      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid, display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
        <span style={{ color: T.red }}>▍stop {zoneText(pb.exits?.stop?.zone)}</span>
        <span style={{ color: T.brass }}>▍entry {zoneText(pb.entry?.zone)}</span>
        <span style={{ color: T.ink }}>▍now {rupee(pb.price, 0)}</span>
        {/* Three dashes here would read as three levels the engine failed to
            produce. It produced them and threw them out. */}
        {noRoom ? (
          <span style={{ color: T.red }}>no target tier — all three sat closer than the stop</span>
        ) : (
          <>
            <span style={{ color: T.green }}>▍safe {zoneText(pb.exits?.safe?.zone)}</span>
            <span style={{ color: T.brass }}>▍primary {zoneText(pb.exits?.primary?.zone)}</span>
            <span style={{ color: T.blue }}>▍stretch {zoneText(pb.exits?.stretch?.zone)}</span>
          </>
        )}
      </div>

      <Label>Entry · confidence</Label>
      <Confidence c={pb.entry?.confidence} />
      <div style={{ marginTop: 8 }}>
        <Convergence n={pb.entry?.convergence} zone={pb.entry?.zone} spread={pb.entry?.spread} families={pb.entry?.families} />
      </div>
      {(pb.entry?.anchors || []).length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 6, lineHeight: 1.7 }}>
          {pb.entry.anchors.map(a => <div key={a.name}>· {rupee(a.price, 0)} — {a.name}{a.type ? ` (${a.type})` : ""}</div>)}
        </div>
      )}
      <div style={{ marginTop: 10 }}><EvidenceStack items={pb.entry?.evidence} /></div>

      <Label>Exits · confidence</Label>
      <Confidence c={exitConf(pb)} />
      {noRoom && (
        <div style={{ fontSize: 11.5, color: T.red, lineHeight: 1.6, marginTop: 8 }}>
          No exit tier is listed because none of them cleared the stop. What follows is the invalidation level only.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
        {["safe", "primary", "stretch"].map(k => {
          const e = ex(pb, k); if (!e) return null;
          const rr = rrOf(pb)?.[`to${k[0].toUpperCase()}${k.slice(1)}`];
          const poor = rr != null && rr < 1;
          return (
            <div key={k} style={{ background: T.card, border: "1px solid " + (poor ? T.red + "55" : T.line), borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, minWidth: 52 }}>{k.toUpperCase()}</span>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{zoneText(e.zone)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.green }}>{pctText(e.pct)}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}
                  title={(e.families || []).join(" · ")}>
                  {e.convergence != null ? `${e.convergence} agree` : ""}
                  {e.families?.length ? ` · ${e.families.join(", ")}` : ""}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 10.5, color: poor ? T.red : T.dimSolid, marginLeft: "auto" }}>
                  {rr != null ? `R:R ${(+rr).toFixed(1)}${poor ? " · risk exceeds reward" : ""}` : ""}
                </span>
              </div>
              {e.anchor && <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>{e.anchor}</div>}
              {e.evidence?.length > 0 && <div style={{ marginTop: 7 }}><EvidenceStack items={e.evidence} /></div>}
            </div>
          );
        })}
        {ex(pb, "stop") && (
          <div style={{ background: T.card, border: "1px solid " + T.red + "44", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.red, minWidth: 52 }}>INVALIDATION</span>
              <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{zoneText(ex(pb, "stop").zone)}</span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.red }}>{pctText(ex(pb, "stop").pct)}</span>
            </div>
            <div style={{ fontSize: 11, color: T.mute, marginTop: 4 }}>{ex(pb, "stop").anchor} — {ex(pb, "stop").rationale}</div>
          </div>
        )}
      </div>
      {/* Already stated above the numbers when noRoom, with its heading. A
          second copy down here reads as a second, separate problem. */}
      {!noRoom && (pb.exits?.riskRewardWarning || pb.riskRewardWarning) && (
        <div style={{ fontSize: 11.5, color: T.red, marginTop: 8 }}>⚠ {pb.exits?.riskRewardWarning || pb.riskRewardWarning}</div>
      )}

      {/* Candles are cross-verification. Said once, plainly. */}
      <Label>Candlestick reading</Label>
      <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.55, marginBottom: 8 }}>
        Patterns confirm or contradict a level — they are not a reason on their own. Follow-through is measured from this
        stock&apos;s own history, not a textbook table.
      </div>
      {(() => {
        // The backend now separates these explicitly: `valid` may be shown as
        // evidence, `detected` exists for transparency and includes patterns
        // that failed their context test. Never render detected as findings.
        const all = pb.candles?.detected || [];
        const valid = pb.candles?.valid || all.filter(c => c.contextValid !== false);
        const validNames = new Set(valid.map(c => c.name));
        const contextless = all.filter(c => c.contextValid === false || !validNames.has(c.name));
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
                {/* A named person's call is not a brokerage target — and it ages
                    faster: 45 days vs 90. Stale ones are struck through, never
                    dropped, so an old view cannot masquerade as current. */}
                {c.kind === "expert" && (
                  <span style={{ fontFamily: T.mono, fontSize: 8.5, letterSpacing: .8, color: T.brass,
                    border: "1px solid " + T.brass + "55", borderRadius: 4, padding: "1px 4px" }}>EXPERT</span>
                )}
                <span style={{ fontSize: 12.5, color: T.ink, textDecoration: c.stale ? "line-through" : "none" }}>{c.broker || c.name}</span>
                {c.stale && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.dimSolid }}>
                  stale · older than {c.staleAfterDays || (c.kind === "expert" ? 45 : 90)}d
                </span>}
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

      <AddBrokerCall symbol={pb.symbol} onAdd={onAddCall} />

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
  ["potential", "Potential left"], ["entryConf", "Confidence"], ["distance", "Distance to entry"], ["symbol", "Symbol"],
];

export default function Playbook({ backendUrl, live, profileId, profiles, held, onHold, holdBusy }) {
  const api = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);
  /* The panel answers "what is the plan under this profile". Without a selector
     it answered that once, for whatever the app happened to be showing, and
     there was no way to ask it about another. Seeded from the app's profile so
     the two agree on open, then owned here. */
  const fallback = profileId || "ALL";
  const [profile, setProfile] = useState(fallback);
  useEffect(() => { setProfile(fallback); }, [fallback]);
  /* Holdings-only profiles have no watchlist-wide playbook to show. "All" is
     first and is a real option the backend understands — previously selecting
     it silently substituted swing, so the panel answered a question nobody
     asked and looked like it had no all-profiles view. */
  const choices = [{ id: "ALL", name: "All profiles" },
    ...Object.entries(profiles || {})
      .filter(([, p]) => p?.appliesTo !== "holdings")
      .map(([id, p]) => ({ id, name: p?.name || id }))];
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [sort, setSort] = useState({ key: "potential", dir: "desc" });
  const [stateFilter, setStateFilter] = useState("");
  const [mode, setMode] = useState("");


  const load = useCallback(async () => {
    if (!api) return;
    setErr("");
    try {
      const j = await api.playbookAll(profile);
      setRows(j?.rows || j?.playbooks || []);
      setMode(j?.mode || "");
    }
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
  /* null on noRoom, not 0. The sorter puts missing values last in both
     directions precisely so absence never reads as a low value — and here the
     percentage that survives in the payload belongs to a target that was
     thrown away, so sorting on it ranks rows by a number nobody may act on. */
  const val = r => sort.key === "potential" ? (noRoomOf(r) ? null : r.potential?.toPrimaryPct)
    : sort.key === "entryConf" ? r.entry?.confidence?.score
    : sort.key === "exitConf" ? exitConf(r)?.score
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

  /* Headers follow the rows. Each row is one direction and carries its own
     labels; a combined "Entry / Sell at" described neither accurately. */
  const shortRows = sorted.filter(isShort);
  const anyShort = shortRows.length > 0;
  /* Rows carry shortability inline as of 0f4d616 — no second call. */
  const shortOf = r => r.shortability || null;
  const uniq = (k, fb) => [...new Set(sorted.map(r => r[k] || fb(r)))];
  const actions = uniq("actionLabel", r => (r.direction === "sell" ? "Sell at" : "Entry"));
  const targets = uniq("targetLabel", r => (r.direction === "sell" ? "Buy back" : "Target"));
  const mixedAction = actions.length > 1, mixedTarget = targets.length > 1;
  const actionHeader = mixedAction ? "Action" : (actions[0] || "Entry");
  const targetHeader = mixedTarget ? "Target" : (targets[0] || "Target");

  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 10 }}>
        Where to get in, where it is now, where to get out, and what is left.
        <span style={{ color: T.dimSolid }}> Tap a confidence score — or any row — for the evidence behind it. Confidence
        measures how many methods agree, not whether the trade works.</span>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        {/* Sorting moved into the table — every column, not six presets. The
            state chips stay: they are a view of the book, not a column sort. */}
        {choices.length > 0 && (
          <select value={profile} onChange={e => setProfile(e.target.value)}
            style={{ ...chip(true), fontFamily: T.sans, appearance: "auto" }}
            title="Which profile's plan to show. Timeframes come from where each row actually locked, not from this.">
            {choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {Object.entries(STATES).map(([k, v]) => (
          <button key={k} onClick={() => setStateFilter(f => (f === k ? "" : k))} style={chip(stateFilter === k)}>{v.label}</button>
        ))}
        <button onClick={load} style={{ ...btn(), marginLeft: "auto" }}>↻</button>
      </div>

      {/* The server explains what a combined view actually contains. Written to
          be rendered as-is: paraphrasing it would put a second description of
          the same behaviour in a place that cannot see the code. */}
      {mode && profile === "ALL" && (
        <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginBottom: 10,
          background: T.brassSoft, border: "1px solid " + T.brass + "3A", borderRadius: 9, padding: "8px 11px" }}>
          {mode}
        </div>
      )}

      {/* Non-negotiable: on screen for as long as a short is, never behind a
          tap. A long can go to zero; a short has no ceiling. */}
      {anyShort && <RiskNote text={shortRows[0]?.riskNote} count={shortRows.length} />}

      {/* The call is ~35ms now; an interstitial would flash rather than inform. */}
      {!rows ? null : (
        <DataTable
          dense
          rows={sorted}
          rowKey={r => r.symbol}
          onRowClick={r => openRow(r.symbol)}
          expanded={open}
          empty="No symbols match this filter."
          renderExpanded={r => (!detail
            ? <span style={{ fontSize: 12, color: T.dimSolid }}>Reading the evidence…</span>
            : detail.error
              ? <span style={{ fontSize: 12, color: T.amber }}>Could not load the detail — {detail.error}</span>
              : <Detail pb={detail} held={held?.has(r.symbol)} busy={holdBusy === r.symbol} onHold={onHold}
                  shortability={isShort(r) ? shortOf(r) : null}
                  onAddCall={async body => { await api.addAnalystCall(body); await openRow(r.symbol); await openRow(r.symbol); }} />)}
          columns={[
            { key: "symbol", label: "Symbol", type: "text", align: "left", mono: false,
              render: r => {
                const st = STATES[stateOf(r)];
                const rr = rrOf(r)?.toPrimary;
                return (
                  <span>
                    <span style={{ fontFamily: T.mono, color: T.ink }}>{r.symbol}</span>
                    <div style={{ fontFamily: T.mono, fontSize: 8.5, color: st.colour }}>{st.label}</div>
                    {/* These two stay on the row. Behind a tap, the app would be
                        quieter about danger than about opportunity. */}
                    {r.entry?.chasing && (
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: T.red }} title={r.entry.warning || "chasing"}>⚠ chasing</div>
                    )}
                    {/* On noRoom there is no primary target to quote a ratio
                        against — the ratio in the payload belongs to the one
                        that was rejected. Say the conclusion instead. */}
                    {noRoomOf(r)
                      ? <div style={{ fontFamily: T.mono, fontSize: 9, color: T.red }}
                          title={r.exits?.riskRewardWarning || r.riskRewardWarning || "A target was computed and rejected."}>⚠ no target</div>
                      : rr != null && rr < 1 && (
                        <div style={{ fontFamily: T.mono, fontSize: 9, color: T.red }} title="Risk exceeds reward to the primary target">⚠ R:R {(+rr).toFixed(1)}</div>
                      )}
                  </span>
                );
              } },
            { key: "direction", label: "Dir", type: "cat", value: r => r.direction || "buy",
              render: r => <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: .8,
                color: r.direction === "sell" ? T.blue : T.green,
                border: "1px solid " + (r.direction === "sell" ? T.blue : T.green) + "55",
                borderRadius: 4, padding: "1px 5px" }}>{(r.direction || "buy").toUpperCase()}</span> },
            /* Each row is one direction, so a combined header was wrong on
               every row it described. When the visible rows agree, the header
               states their shared label; when they are mixed, it stays neutral
               and each cell carries its own. */
            /* Which profile built this row, and whether that was a real lock or
               the swing fallback. Without the distinction, a fallback row reads
               as "Swing likes this" when the truth is "nothing locked it". */
            ...(profile === "ALL" ? [{ key: "builtUnder", label: "Profile", type: "cat",
              value: r => r.profileId || "—",
              render: r => (
                <span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.ink }}>{r.profileId || "—"}</span>
                  {r.profileChosenBy === "default" && (
                    <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.dimSolid }}
                      title="Not locked under any profile — levels are shown under the swing default so the row is not blank.">
                      fallback
                    </div>
                  )}
                </span>
              ) }] : []),
            /* Only meaningful for shorts, so it stays out of the way on a
               long-only page rather than filling with dashes. */
            ...(anyShort ? [{ key: "shortability", label: "Can hold?", type: "cat",
              value: r => { const sa = shortOf(r); return !sa ? "—" : !sa.known ? "unknown" : sa.fno ? "F&O" : "intraday only"; },
              render: r => <ShortabilityChip s={shortOf(r)} clamped={r.horizonClamped} />,
              title: "Whether the short can be carried overnight. Cash-market shorts must be closed the same session." }] : []),
            { key: "entry", label: actionHeader, type: "number",
              value: r => r.entry?.zone?.low,
              render: r => <span>
                {mixedAction && <span style={{ fontFamily: T.mono, fontSize: 8.5, color: T.dimSolid, display: "block" }}>
                  {r.actionLabel || (r.direction === "sell" ? "Sell at" : "Entry")}</span>}
                {zoneText(r.entry?.zone)}
              </span> },
            { key: "price", label: "Current", type: "number", render: r => rupee(r.price, 0) },
            { key: "target", label: targetHeader, type: "number",
              value: r => ex(r, "primary")?.zone?.low,
              render: r => noRoomOf(r) ? <NoTargetCell r={r} /> : <span>
                {mixedTarget && <span style={{ fontFamily: T.mono, fontSize: 8.5, color: T.dimSolid, display: "block" }}>
                  {r.targetLabel || (r.direction === "sell" ? "Buy back" : "Target")}</span>}
                {zoneText(ex(r, "primary")?.zone)}
              </span> },
            { key: "left", label: "Left", type: "number",
              // Magnitude: a sell capturing 5% ranks with a buy gaining 5%.
              // null on noRoom — the surviving percentage is the rejected
              // target's, and ranking rows by it re-promotes the number.
              value: r => noRoomOf(r) ? null
                : ex(r, "primary")?.movePct ?? (r.potential?.toPrimaryPct != null ? Math.abs(r.potential.toPrimaryPct) : null),
              render: r => noRoomOf(r)
                ? <NoTargetCell r={r} small />
                : incoherence(r)
                ? (isShort(r)
                    ? <span title="The cover level sits above where the short is entered — this is not a takeable plan" style={{ color: T.red, fontSize: 10 }}>cover above entry</span>
                    : <span title="Every target sits below the entry trigger — this is not a takeable plan" style={{ color: T.red, fontSize: 10 }}>targets below entry</span>)
                : (r.convergence ?? r.entry?.convergence) === 0
                ? <span title="Methods do not converge — no reliable level" style={{ color: T.amber, fontSize: 10 }}>no level</span>
                : <span style={{ color: moveColour(ex(r, "primary"), r.direction) }}>
                    {moveText(ex(r, "primary") || { movePct: r.potential?.toPrimaryPct }, r.direction)}
                  </span> },
            { key: "timeframe", label: "Timeframe", type: "cat", value: r => timeframeOf(r),
              title: "The horizon of the profile this row actually locked under. A dash means it has not locked under any." },
            { key: "confidence", label: "Confidence", type: "number",
              value: r => r.entry?.confidence?.score,
              /* A high score and a losing ratio are not in tension — confidence
                 measures agreement between methods, not whether the bet pays.
                 Putting the warning anywhere but here lets the score be read
                 alone, and on a short the losing side has no ceiling. */
              render: r => <span>
                <Confidence c={r.entry?.confidence} compact onExpand={() => openRow(r.symbol)} />
                {/* The server's wording when it sends one. Playbook rows carry
                    riskRewardWarning null today — only /signals/preview fills
                    it — so a sub-1:1 ratio still gets said here rather than
                    waiting for the string to arrive. The score must never be
                    readable on its own. */}
                {/* The locally-written fallback names "the primary target",
                    which does not exist on a noRoom row — so it is only ever
                    used when a target is actually being offered. */}
                {(r.riskRewardWarning || r.exits?.riskRewardWarning || (!noRoomOf(r) && rrOf(r)?.toPrimary != null && rrOf(r).toPrimary < 1)) && (
                  <div style={{ fontSize: 9.5, color: T.red, lineHeight: 1.45, marginTop: 3, maxWidth: 190 }}>
                    ⚠ {r.riskRewardWarning || r.exits?.riskRewardWarning
                      || `Risk-reward to the primary target is ${(+rrOf(r).toPrimary).toFixed(2)}:1 — below 1:1, so the maths is against this regardless of how the setup looks.`}
                  </div>
                )}
              </span> },
          ]} />
      )}

      <p style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 16, textAlign: "center" }}>
        Reliability figures are measured, and measurement takes months — &ldquo;not yet measurable&rdquo; is the honest
        reading, not a gap. <span style={{ color: T.brass }}>The call is yours.</span>
      </p>
    </div>
  );
}
