"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deskApi, pctText, rupee, SEVERITY_ORDER, noRoomOf, withheldOf } from "../lib/desk";
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

/* exitLevels arrive as percentages. A percentage is not something you can put
   in a broker's order box, so render the price and keep the percentage beside
   it rather than making the user do the arithmetic at the moment they are
   deciding. */
const atPct = (price, pct) => (price != null && pct != null ? price * (1 + pct / 100) : null);

/* Which price those percentages are measured from.

   NOT `sig.price`. The engine measures from `basisPrice` — the trigger for a
   setup still waiting on its breakout, spot otherwise — and a fired signal can
   still be one of those, because `requireAll` is off by default and a stock can
   lock on fundamentals and volume with its breakout level untouched overhead.
   Dividing by spot there produced a target underneath the entry.

   A history record does not carry `basisPrice`, but it does carry the absolute
   rupee levels the alert actually sent. So the basis is recovered from a stored
   price and its own percentage — exact, not approximated — and only falls back
   to spot when the record predates those fields. */
function basisFor(sig) {
  const direct = sig.potential?.basisPrice ?? sig.basisPrice;
  if (direct != null) return { price: direct, exact: true };
  const e = sig.exitLevels || {}, L = sig.levels || {};
  for (const [abs, pct] of [[L.exit, e.primary], [L.stop, e.stop]]) {
    if (abs != null && pct != null && 1 + pct / 100 !== 0) {
      return { price: abs / (1 + pct / 100), exact: true };
    }
  }
  return { price: sig.price ?? null, exact: false };
}

/* The percentages are stored rounded to two places, so a basis recovered from
   one of them lands a few paise off spot even when spot IS the basis. A trigger
   the setup has not reached is materially further away than that; anything
   inside a quarter of a percent is the same price and must not be announced as
   a different one. */
const basisIsShifted = (basis, price) =>
  basis != null && price != null && Math.abs(basis - price) / price > 0.0025;

/* What the alert said, for a record the read-time guard now withholds.

   Deliberately behind a tap and deliberately not styled like the live cells.
   These percentages went out in a Telegram message and the record is evidence
   of that, so hiding them would erase something the user may remember
   receiving — but they describe a trade the engine would refuse to emit today,
   so showing them at the weight of a target would re-issue it. */
function AsSent({ onRead, price }) {
  const [open, setOpen] = useState(false);
  const o = onRead.original || {};
  const tiers = ["safe", "primary", "stretch"].filter(k => o[k] != null);
  if (!tiers.length) return null;
  return (
    <div style={{ marginTop: 5 }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ all: "unset", cursor: "pointer", fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>
        {open ? "hide what the alert said ▴" : "what the alert said ▾"}
      </button>
      {open && (
        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, lineHeight: 1.7, marginTop: 4 }}>
          {tiers.map(k => (
            <div key={k}>
              {k} {pctText(o[k])}
              {price != null && <span style={{ color: T.dim }}> · {rupee(price * (1 + o[k] / 100), 2)}</span>}
            </div>
          ))}
          {/* `why` is a full clause from the server — rendered as one, not
              slotted into a sentence of mine that then reads twice. */}
          <div style={{ color: T.dim, marginTop: 3, lineHeight: 1.5 }}>
            {onRead.riskReward != null ? `${onRead.riskReward}:1 against the stop. ` : ""}
            This is what went out — {onRead.why || "written before the risk-reward guard existed"}. History, not advice.
          </div>
        </div>
      )}
    </div>
  );
}

function ExitLevels({ sig }) {
  const e = sig.exitLevels;
  const noRoom = noRoomOf(sig);
  const onRead = sig.levelsWithheldOnRead;
  if (!e && !noRoom) return null;
  const basis = basisFor(sig);
  const px = basis.price;
  const shifted = basis.exact && basisIsShifted(px, sig.price);
  const cell = (label, pct, tone) => {
    const v = atPct(px, pct);
    if (v == null) return null;
    return (
      <div key={label} style={{ background: T.raised || "#20221799", border: "1px solid " + T.line,
        borderRadius: 7, padding: "6px 9px", minWidth: 88 }}>
        <div style={{ fontFamily: T.mono, fontSize: 8, letterSpacing: 1, color: T.dimSolid }}>{label}</div>
        <div style={{ fontFamily: T.mono, fontSize: 12, color: tone, marginTop: 2 }}>{rupee(v, 2)}</div>
        <div style={{ fontFamily: T.mono, fontSize: 8.5, color: T.dimSolid }}>{pctText(pct)}</div>
      </div>
    );
  };
  /* The stop renders at the same size as the targets. A card that shows three
     ways to win in colour and the way to lose in small grey type is selling,
     not informing. */
  const cells = [
    cell("SAFE", e?.safe, T.green),
    cell("TARGET", e?.primary, T.green),
    cell("STRETCH", e?.stretch, T.green),
    cell("STOP", e?.stop, T.red),
  ].filter(Boolean);
  if (!cells.length && !noRoom) return null;

  /* Same number for all three exits means the methods did not separate them —
     saying so beats printing the same price three times as if it were a ladder. */
  const flat = e?.safe != null && e.safe === e.primary && e.primary === e.stretch;
  const withheld = withheldOf(sig);
  return (
    <div style={{ marginTop: 8 }}>
      {/* A target was computed and rejected. Rendering only a lone STOP cell
          would read as a partial payload; it is a conclusion. */}
      {noRoom && (
        <div style={{ background: T.red + "12", border: "1px solid " + T.red + "55", borderLeft: "3px solid " + T.red,
          borderRadius: 8, padding: "8px 11px", marginBottom: 7 }}>
          <div style={{ fontFamily: T.mono, fontSize: 8.5, letterSpacing: 1.2, color: T.red, marginBottom: 4 }}>NO TARGET OFFERED</div>
          <div style={{ fontSize: 11.5, color: T.red, lineHeight: 1.55 }}>
            {sig.riskRewardWarning || sig.exits?.riskRewardWarning
              || "A target was computed and rejected for sitting closer than the stop — there is less to gain than to lose on any exit plan."}
          </div>
          {withheld && (
            <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 5, lineHeight: 1.6 }}>
              rejected: {["safe", "primary", "stretch"].filter(k => withheld[k] != null)
                .map(k => `${k} ${rupee(withheld[k], 2)}`).join(" · ")} — for inspection, not to act on
            </div>
          )}
          {/* A record written before the guard existed. The engine withholds
              its targets on the way out but never rewrites the record, so the
              percentages it actually sent are still available — behind a tap,
              labelled as history, because a message that went out months ago
              is a fact about the past and not a level to trade. */}
          {onRead && <AsSent onRead={onRead} price={px} />}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{cells}</div>
      {/* Only when it is not the price on the card above it. Silent arithmetic
          off a different price is exactly how a target ended up below its
          own entry. */}
      {shifted && cells.length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 4 }}>
          measured from {rupee(px, 2)} — where this trade starts, not the {rupee(sig.price, 2)} it fired at
        </div>
      )}
      {/* Every record that predates the stored basis lands here, so it is kept
          short — a long caveat on every legacy row is one the reader stops
          seeing before the row where it matters. */}
      {!basis.exact && cells.length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 4 }}
          title="This record does not carry the price the engine measured from, so the signal price is used. On a setup that had not triggered, the real basis was the trigger.">
          measured from the signal price · basis not recorded
        </div>
      )}
      {flat && (
        <div style={{ fontSize: 10, color: T.dimSolid, marginTop: 4, lineHeight: 1.5 }}>
          All three exits sit at the same level — the methods did not separate them, so treat it as one target, not a ladder.
        </div>
      )}
    </div>
  );
}

/* Cards that tell you to CLOSE something, not to open it.

   "I took this" writes a new long. On one of these it would record a position
   from a signal to exit one — the levels point the wrong way and the entry is
   a price you are supposed to be selling at. The backend now rejects it with a
   400, which turns a silently wrong holding into a visible error; neither is
   the right outcome, so the button does not appear.

   Keyed on the profile ids the backend names rather than on `direction`: a
   `short` signal is also direction "sell" and IS an entry, and the two must
   not be collapsed. */
const EXIT_PROFILES = new Set(["sell_holdings", "buyback_holdings"]);
const isExitCard = (sig) => EXIT_PROFILES.has(sig?.profileId);

function SignalCard({ sig, onHold, held, busy, onTook, tookBusy }) {
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

      <ExitLevels sig={sig} />

      <div style={{ marginTop: 9, display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
        {held
          ? <span style={{ fontFamily: T.mono, fontSize: 10, color: T.green }}>✓ in your book</span>
          : isExitCard(sig)
          ? <span style={{ fontSize: 11, color: T.dimSolid, lineHeight: 1.5 }}>
              This is a signal to close a position, not to open one — it has nothing to record.
            </span>
          : <>
              {/* One tap records the real position with the levels this signal
                  is showing — the stop and target the exit rules then run
                  against. Retyping them by hand is how they end up different
                  from the plan that justified the trade. */}
              <button onClick={() => onTook(sig)} disabled={tookBusy}
                style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.brass,
                  background: T.brass, color: "#141206", fontSize: 11.5, fontWeight: 600,
                  cursor: tookBusy ? "default" : "pointer", opacity: tookBusy ? .5 : 1 }}>
                {tookBusy ? "Recording…" : "I took this"}
              </button>
              <button onClick={() => onHold(sig.symbol)} disabled={busy}
                style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + T.line, background: "transparent", color: T.mute, fontSize: 11, cursor: "pointer" }}>
                just watch it
              </button>
            </>}
      </div>
    </div>
  );
}

export default function Brief({ backendUrl, live, onLeave, exitsPerAccount }) {
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

  /* "I took this" records a real position, not a paper trade — the levels the
     signal is showing become the holding's stop and target, so the exit rules
     run against the plan that justified the trade rather than one retyped
     later from memory. The profile is carried too: an intraday entry and a
     long-term entry are not the same position and must not be scored alike.

     purchaseDate is set to today because that is the claim being made. The
     backend defaults it to null and warns that markedAt is wrong in the
     expensive direction for STCG; saying it explicitly avoids that. */
  const [tookBusy, setTookBusy] = useState(null);
  const took = async (sig) => {
    // The button is not rendered on these; the guard is here so a future caller
    // cannot reintroduce the 400 by wiring it up somewhere else.
    if (isExitCard(sig)) return;
    setTookBusy(sig.symbol);
    try {
      const e = sig.exitLevels || {};
      const entryPrice = sig.price;
      /* Percentages convert against the basis, never against spot — and the
         absolute prices the alert carried are preferred over any conversion,
         because those are the levels the user was actually told. */
      const basis = basisFor(sig).price;
      const at = pct => (basis != null && pct != null ? +(basis * (1 + pct / 100)).toFixed(2) : undefined);
      /* noRoom means the target was computed and rejected. Recording the
         withheld price here would put the number back into the one slot the
         backend removed it from, and the exit rules would then run against a
         level the engine refused to publish. No target is the correct record. */
      let target = noRoomOf(sig) ? undefined : (sig.levels?.exit ?? at(e.primary));
      let stopLoss = sig.levels?.stop ?? at(e.stop);

      /* The same guard the backend applies before a level leaves the process,
         applied again at the moment one is written into a position.

         The plan was built for an entry at `basis`. When the user takes it
         somewhere else — BEL's alert said enter at ₹431.50 and it fired at
         ₹399.10 — the plan's stop can land ABOVE the price actually paid, and
         a holding whose stop is above its entry stops out on the way up.
         Re-deriving the levels from the new entry would be worse: it invents
         numbers nobody published and calls them the plan.
         So neither is recorded, and the reason is said out loud. */
      /* Buys only. On a `sell_holdings` card "sell" means close a position you
         already have, and its percentages point upward because you are selling
         into strength — read as a short entry they look inverted when nothing
         is wrong. This button records a new long, so that is the only shape
         being checked. */
      const isBuy = (sig.direction || "buy") !== "sell";
      const bad = isBuy && entryPrice != null
        && ((target != null && target <= entryPrice) || (stopLoss != null && stopLoss >= entryPrice));
      if (bad) { target = undefined; stopLoss = undefined; }

      await api.hold2({
        symbol: sig.symbol,
        profileId: sig.profileId || undefined,
        entryPrice,
        stopLoss,
        target,
        purchaseDate: new Date().toISOString().slice(0, 10),
      });
      await load();
      // after load(), which clears the message slot on a successful refresh
      if (bad) {
        setState(s => ({ ...s, err: `${sig.symbol} was recorded without a stop or target. Its levels were built for an entry at ${rupee(basis, 2)}; at the ${rupee(entryPrice, 2)} you are entering at, they land on the wrong side of your entry. Re-deriving them here would invent numbers the engine never published, so they are left blank — set them yourself in Positions.` }));
      }
    } catch (err) {
      setState(s => ({ ...s, err: `Could not record ${sig.symbol} — ${err.message}` }));
    } finally { setTookBusy(null); }
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
            {/* "No exit rule fired" is a claim about your holdings. On an
                instance with accounts the exit scan does not run for them yet,
                so that claim would be unearned — say what was actually
                checked. */}
            {exitsPerAccount
              ? "No new signal locked, no IPO closing and no event inside three sessions. Exit rules on your holdings were not checked — see below."
              : "No exit rule fired, no new signal locked, no IPO closing and no event inside three sessions."}
            {" "}The scan kept running — silence here is a result, not a failure.
          </div>
        </div>
      ) : (
        <>
          {/* Not an empty state — a scope statement. The exit and cycle scans
              still read the instance-wide holdings file, so the backend skips
              them for a signed-in account rather than mailing everyone about
              one person's positions. An absent section here would read as
              "your holdings are fine". */}
          {exitsPerAccount && (
            <div style={{ marginTop: 18, background: T.amber + "10", border: "1px solid " + T.amber + "40",
              borderLeft: "3px solid " + T.amber, borderRadius: 9, padding: "10px 12px" }}>
              <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.amber, marginBottom: 4 }}>
                EXIT RULES NOT RUN
              </div>
              <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.6 }}>
                Exit and buy-back scans are not per-account yet, so they are skipped for signed-in users rather
                than run against someone else&apos;s book. Nothing here says your holdings are fine — it says they
                were not checked. Your stops are yours to watch until this ships.
              </div>
            </div>
          )}

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
                  <SignalCard key={sig.id || sig.symbol} sig={sig} busy={state.busy} held={held.has(sig.symbol)}
                    onHold={hold} onTook={took} tookBusy={tookBusy === sig.symbol} />
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
