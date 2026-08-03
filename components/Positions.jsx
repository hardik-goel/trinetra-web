"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { deskApi, pctText, rupee, SEVERITY_ORDER } from "../lib/desk";

/* ================================================================
   POSITIONS — what is at risk right now.

   Exit signals sit at the top because money already committed beats a
   new idea for attention. Each one leads with its reasoning: an alert
   that says "SELL" and nothing else asks for the most consequential
   action in the app while withholding the evidence, so it gets obeyed
   blindly or ignored. Neither is a decision.
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
export const POSITIONS_T = T;

const SEV = { high: T.red, medium: T.amber, low: T.blue };
const btn = (primary) => ({
  padding: "6px 11px", borderRadius: 7, border: "1px solid " + (primary ? T.brass : T.line),
  background: primary ? T.brass : "transparent", color: primary ? "#141206" : T.mute,
  fontSize: 11.5, fontWeight: primary ? 600 : 400, cursor: "pointer",
});
const inS = { background: T.bg, border: "1px solid " + T.line, color: T.ink, fontFamily: T.mono, fontSize: 11, borderRadius: 6, padding: "6px 8px" };
const Label = ({ children, accent }) => (
  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: accent || T.brass, marginBottom: 8, textTransform: "uppercase" }}>{children}</div>
);
const tone = v => (v == null ? T.mute : v > 0 ? T.green : v < 0 ? T.red : T.mute);

/* ── one exit signal ─────────────────────────────────────────────── */
function ExitCard({ sig, onClose, onDismiss, busy }) {
  const [closing, setClosing] = useState(false);
  const [exitPrice, setExitPrice] = useState(sig.evidence?.currentPrice ?? "");
  const colour = SEV[sig.severity] || T.mute;
  const e = sig.evidence || {};
  const facts = [
    ["Entry", rupee(e.entryPrice)], ["Now", rupee(e.currentPrice)],
    ["Trigger level", rupee(e.triggerLevel)], ["From entry", pctText(e.pctFromEntry)],
    ["Days held", e.daysHeld ?? "—"],
    e.peakPrice != null && ["Peak since entry", rupee(e.peakPrice)],
    e.criterionAtEntry && ["At entry", e.criterionAtEntry],
    e.criterionNow && ["Now", e.criterionNow],
  ].filter(Boolean);

  return (
    <div className="rise" style={{ background: T.card, border: "1px solid " + colour + "55", borderLeft: "3px solid " + colour,
      borderRadius: 11, padding: "13px 15px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1, color: colour, border: "1px solid " + colour + "66", borderRadius: 4, padding: "2px 5px" }}>
          {String(sig.severity || "").toUpperCase()}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 13, color: T.ink }}>{sig.symbol}</span>
        <span style={{ fontSize: 13.5, color: colour, fontWeight: 600 }}>{sig.headline}</span>
      </div>

      {/* The feature itself. Never truncated, never reduced to a chip. */}
      <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7, marginTop: 8 }}>
        {sig.reasoning || sig.rationale}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px 16px", marginTop: 10 }}>
        {facts.map(([k, v]) => (
          <div key={k} style={{ fontSize: 11 }}>
            <span style={{ color: T.dimSolid }}>{k} </span>
            <span style={{ color: T.mute, fontFamily: T.mono, fontSize: 11 }}>{v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: colour }}>{sig.suggestedAction || "Review"}</span>
        <span style={{ fontSize: 10.5, color: T.dimSolid }}>{sig.note || "Decision support, not an instruction — the call is yours."}</span>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        {closing ? (
          <>
            <input type="number" step="any" value={exitPrice} onChange={ev => setExitPrice(ev.target.value)} placeholder="Exit ₹" style={{ ...inS, width: 100 }} />
            <button disabled={!(+exitPrice > 0) || busy} style={{ ...btn(true), opacity: +exitPrice > 0 ? 1 : .4 }}
              onClick={() => onClose(sig.holdingId, { status: "closed", exitPrice: +exitPrice, exitReason: sig.rule })}>
              Confirm closed
            </button>
            <button onClick={() => setClosing(false)} style={btn()}>Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => setClosing(true)} style={btn(true)}>Mark closed</button>
            <button onClick={() => onDismiss(sig.holdingId, sig.rule)} disabled={busy} style={btn()}
              title="Stop this one rule firing for this holding">Dismiss this rule</button>
          </>
        )}
      </div>
    </div>
  );
}

/* The pair that must never be separated. Showing "made ₹6,000 trimming"
   without "₹54,000 worse than holding" teaches the user the activity works
   when his own data says otherwise — so they render on one row, same size. */
function CyclePnl({ cycle }) {
  if (!cycle || (cycle.realisedFromCycle == null && cycle.realisedPctFromCycle == null)) return null;
  const qty = cycle.qtyKnown !== false;
  const realised = qty ? rupee(cycle.realisedFromCycle) : pctText(cycle.realisedPctFromCycle);
  const vs = cycle.cycleVsHold;
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline", marginTop: 6 }}>
      <span style={{ fontFamily: T.mono, fontSize: 11.5, color: tone(cycle.realisedFromCycle ?? cycle.realisedPctFromCycle) }}>
        {realised} from trimming
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 11.5, color: vs == null ? T.dimSolid : tone(vs) }}>
        {vs == null
          ? `vs holding: ${cycle.notComparableReason || "not yet comparable"}`
          : `${rupee(vs)} vs just holding`}
      </span>
      {!qty && <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>no quantity recorded — percentages only</span>}
    </div>
  );
}

/* Quantity as fractions, because the user will tap a chip and will not fill a
   form. Without one the backend keeps the rupee figures null rather than
   inventing them. */
function QtyChips({ label, onPick, busy }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button onClick={() => setOpen(true)} disabled={busy} style={btn(true)}>{label}</button>;
  return (
    <span style={{ display: "inline-flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, color: T.dimSolid }}>how much?</span>
      {[["25%", 0.25], ["33%", 0.33], ["50%", 0.5], ["all of it", 1]].map(([t, f]) => (
        <button key={t} disabled={busy} onClick={() => { onPick(f); setOpen(false); }} style={{ ...btn(), padding: "4px 9px", fontSize: 10.5 }}>{t}</button>
      ))}
      <button disabled={busy} onClick={() => { onPick(null); setOpen(false); }} style={{ ...btn(), padding: "4px 9px", fontSize: 10.5 }}
        title="Record it without a quantity — percentages stay honest, rupee figures stay blank">skip</button>
      <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: T.dimSolid, fontSize: 11, cursor: "pointer" }}>✕</button>
    </span>
  );
}

/* ── SELL / BUY cards ─────────────────────────────────────────────
   Above holdings, below fired exit signals: a broken thesis outranks
   profit-taking. The subtitle is the only thing separating this from
   ⚠ CLOSE POSITION and is rendered verbatim, never truncated. */
function CycleCard({ sig, onAct, busy }) {
  const isSell = sig.kind === "sell";
  const colour = isSell ? T.amber : T.green;
  const h = sig.holding || {};
  const hp = h.holdingPeriod || {};
  return (
    <div className="rise" style={{ background: T.card, border: "1px solid " + colour + "55", borderLeft: "3px solid " + colour,
      borderRadius: 11, padding: "13px 15px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, color: colour, fontWeight: 600 }}>{isSell ? "SELL" : "BUY"}</span>
        <span style={{ fontFamily: T.mono, fontSize: 13, color: T.ink }}>{sig.symbol}</span>
      </div>
      <div style={{ fontSize: 12, color: T.mute, marginTop: 2 }}>{sig.subtitle}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 9 }}>
        {(sig.criteria || []).map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontSize: 11.5, color: c.pass ? T.mute : T.dimSolid }}>
            <span style={{ fontFamily: T.mono, color: c.skipped ? T.dimSolid : c.pass ? T.green : T.red, width: 12 }}>
              {c.skipped ? "·" : c.pass ? "✓" : "✕"}
            </span>
            <span style={{ minWidth: 110 }}>{c.name}</span>
            <span style={{ flex: 1, lineHeight: 1.5 }}>{c.detail}</span>
          </div>
        ))}
      </div>

      {sig.reasoning && <div style={{ fontSize: 12.5, color: T.mute, lineHeight: 1.7, marginTop: 8 }}>{sig.reasoning}</div>}

      {isSell && (
        <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid, marginTop: 8, lineHeight: 1.7 }}>
          <div>entry {rupee(h.entryPrice)} · now {rupee(h.currentPrice)} · {pctText(h.gainPct)}</div>
          <div style={{ color: h.stcg ? T.amber : T.dimSolid }}>
            held {hp.months ?? h.heldMonths ?? "—"} months{h.stcg ? " — selling realises STCG" : ""}
          </div>
          {hp.caveat && <div style={{ color: T.amber, fontFamily: T.sans, fontSize: 10.5, lineHeight: 1.5 }}>⚠ {hp.caveat}</div>}
        </div>
      )}
      {!isSell && sig.belowSalePct != null && (
        <div style={{ fontFamily: T.mono, fontSize: 11, color: T.green, marginTop: 8 }}>
          {pctText(sig.belowSalePct)} below your sale at {rupee(sig.sellPrice)}
        </div>
      )}

      <div style={{ fontSize: 12.5, color: colour, marginTop: 9 }}>{sig.suggestion}</div>
      {sig.reentryRisk && <div style={{ fontSize: 11, color: T.dimSolid, marginTop: 4, lineHeight: 1.5 }}>{sig.reentryRisk}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <QtyChips label={isSell ? "I sold some" : "I bought back"} busy={busy}
          onPick={fraction => onAct(sig, fraction)} />
        <span style={{ fontSize: 10.5, color: T.dimSolid }}>Decision support — the call is yours.</span>
      </div>
    </div>
  );
}

/* ── holdings ────────────────────────────────────────────────────── */
function HoldingRow({ h, exits, armed, onEdit, onDrop, busy }) {
  const [open, setOpen] = useState(false);
  const mine = exits.filter(s => s.holdingId === h.id);
  const mineArmed = (armed || []).filter(a => a.holdingId === h.id);
  const near = [...mineArmed].filter(a => a.distanceToTriggerPct != null)
    .sort((a, b) => Math.abs(a.distanceToTriggerPct) - Math.abs(b.distanceToTriggerPct))[0];

  return (
    <div style={{ background: T.card, border: "1px solid " + (mine.length ? T.red + "44" : T.line), borderRadius: 10, padding: "11px 13px", marginBottom: 7 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: T.mono, fontSize: 13, color: T.ink }}>{h.symbol}</span>
            {h.profileId && <span style={{ fontFamily: T.mono, fontSize: 8.5, letterSpacing: .8, color: T.dimSolid, border: "1px solid " + T.line, borderRadius: 4, padding: "1px 4px" }}>{h.profileId}</span>}
            {mine.length > 0 && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.red }}>{mine.length} exit signal{mine.length > 1 ? "s" : ""}</span>}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid, marginTop: 4 }}>
            entry {rupee(h.entryPrice)} · {h.daysHeld ?? "—"}d held{h.qty ? ` · ${h.qty} qty` : ""}
            {h.cycle?.status && h.cycle.status !== "full" && (
              <span style={{ color: T.amber }}> · {h.cycle.status}
                {h.cycle.sellPrice ? ` at ${rupee(h.cycle.sellPrice)}` : ""}
                {h.cycle.belowSalePct != null ? ` · now ${pctText(h.cycle.belowSalePct)} vs that` : ""}
              </span>
            )}
            {h.holdingPeriod?.months != null && (
              <span style={{ color: h.holdingPeriod.stcg ? T.amber : T.dimSolid }}> · {h.holdingPeriod.months}mo{h.holdingPeriod.stcg ? " STCG" : ""}</span>
            )}
          </div>
          {h.holdingPeriod?.caveat && (
            <div style={{ fontSize: 10.5, color: T.amber, marginTop: 3, lineHeight: 1.5 }}>⚠ {h.holdingPeriod.caveat}</div>
          )}
          <CyclePnl cycle={h.cycle} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: T.mono, fontSize: 13, color: tone(h.unrealisedPct) }}>{pctText(h.unrealisedPct)}</div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>{rupee(h.currentPrice)}</div>
        </div>
      </div>

      {/* which rules are armed, and what is closest to firing */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {near && (
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.amber }}>
            {near.headline || near.rule} {Math.abs(near.distanceToTriggerPct).toFixed(1)}% away
          </span>
        )}
        {mineArmed.length > 0 && (
          <span style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid }}>{mineArmed.length} armed</span>
        )}
        <button onClick={() => setOpen(o => !o)} style={{ ...btn(), padding: "3px 8px", fontSize: 10, marginLeft: "auto" }}>
          {open ? "close" : "edit"}
        </button>
      </div>

      {open && (
        <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
          <input type="number" step="any" defaultValue={h.qty ?? ""} placeholder="Qty" style={{ ...inS, width: 80 }}
            onBlur={e => e.target.value !== "" && onEdit(h.id, { qty: +e.target.value })} />
          <input type="number" step="any" defaultValue={h.stopLoss ?? ""} placeholder="Stop" style={{ ...inS, width: 90 }}
            onBlur={e => e.target.value !== "" && onEdit(h.id, { stopLoss: +e.target.value })} />
          <input type="number" step="any" defaultValue={h.target ?? ""} placeholder="Target" style={{ ...inS, width: 90 }}
            onBlur={e => e.target.value !== "" && onEdit(h.id, { target: +e.target.value })} />
          <input type="date" defaultValue={(h.purchaseDate || h.markedAt || "").slice(0, 10)} title="When you actually bought it — fixes the STCG basis"
            style={{ ...inS, width: 148 }}
            onChange={e => e.target.value && onEdit(h.id, { purchaseDate: e.target.value })} />
          <span style={{ fontSize: 10.5, color: T.dimSolid }}>optional — blur to save · date fixes the STCG basis</span>
          <button onClick={() => onDrop(h.id)} disabled={busy} style={{ ...btn(), color: T.red, borderColor: T.red + "55", marginLeft: "auto" }}>
            Remove holding
          </button>
        </div>
      )}
    </div>
  );
}

/* ── concentration + sizing ──────────────────────────────────────── */
function Concentration({ conc, sizing, onSaveSizing, onBackup, onRestoreFile, busy }) {
  const [draft, setDraft] = useState(null);
  /* Remembered on this device so the ritual is one tap next time, never shipped
     in the bundle and never sent anywhere but /backup and /restore. */
  const [token, setTokenState] = useState("");
  useEffect(() => { try { setTokenState(localStorage.getItem("trinetra.backupToken") || ""); } catch {} }, []);
  const setToken = v => { setTokenState(v); try { localStorage.setItem("trinetra.backupToken", v); } catch {} };
  const cfg = draft ?? sizing ?? {};
  const dirty = draft != null;

  return (
    <div style={{ marginTop: 18 }}>
      <Label>Concentration</Label>
      {!conc ? (
        <div style={{ fontSize: 11.5, color: T.dimSolid }}>Not available from this backend.</div>
      ) : (
        <>
          {(conc.warnings || []).map((w, i) => (
            <div key={i} style={{ background: T.amber + "12", border: "1px solid " + T.amber + "44", borderRadius: 9,
              padding: "9px 12px", fontSize: 12.5, color: T.amber, lineHeight: 1.55, marginBottom: 8 }}>
              ⚠ {typeof w === "string" ? w : w.message}
            </div>
          ))}
          <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "11px 13px" }}>
            {(conc.sectors || []).map(s => (
              <div key={s.sector} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: T.mute }}>
                  <span>{s.sector || "Unclassified"}</span>
                  <span style={{ fontFamily: T.mono, color: s.pct >= (conc.sectorLimitPct ?? 40) ? T.amber : T.mute }}>{pctText(s.pct, false)}</span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: T.lineSoft, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(100, s.pct)}%`, height: "100%", background: s.pct >= (conc.sectorLimitPct ?? 40) ? T.amber : T.brass, opacity: .85 }} />
                </div>
              </div>
            ))}
            {!(conc.sectors || []).length && <div style={{ fontSize: 11.5, color: T.dimSolid }}>No open holdings to weigh.</div>}
            {conc.largestPosition && (
              <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.dimSolid, marginTop: 6 }}>
                largest position {conc.largestPosition.symbol} · {pctText(conc.largestPosition.pct, false)} of capital
              </div>
            )}
          </div>
          {(conc.caveats || []).length > 0 && (
            <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.7, marginTop: 8 }}>
              {conc.caveats.map(c => <div key={c}>· {c}</div>)}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 14, borderTop: "1px solid " + T.lineSoft, paddingTop: 12 }}>
        <Label>Capital &amp; risk</Label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="number" step="any" value={cfg.capital ?? ""} placeholder="Capital ₹" style={{ ...inS, width: 130 }}
            onChange={e => setDraft(d => ({ ...(d ?? sizing ?? {}), capital: +e.target.value }))} />
          <input type="number" step="0.1" value={cfg.riskPerTradePct ?? ""} placeholder="Risk %" style={{ ...inS, width: 90 }}
            onChange={e => setDraft(d => ({ ...(d ?? sizing ?? {}), riskPerTradePct: +e.target.value }))} />
          <input type="number" step="0.1" value={cfg.defaultStopPct ?? ""} placeholder="Default stop %" style={{ ...inS, width: 120 }}
            onChange={e => setDraft(d => ({ ...(d ?? sizing ?? {}), defaultStopPct: +e.target.value }))} />
          <button disabled={!dirty || busy} style={{ ...btn(true), opacity: dirty ? 1 : .4 }}
            onClick={() => { onSaveSizing(draft); setDraft(null); }}>Save</button>
        </div>
        <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 7, lineHeight: 1.55 }}>
          Drives the sizing calculator in the stock detail drawer. Risk % is of capital per trade, not of the position.
        </div>

        {/* Records that cannot be reconstructed. On Render's free tier a redeploy
            wipes data/, so this is the step before one — and restore overwrites,
            which is why it is two taps and not one. */}
        <div style={{ marginTop: 14, borderTop: "1px solid " + T.lineSoft, paddingTop: 12 }}>
          <Label>Backup &amp; restore</Label>
          <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginBottom: 9 }}>
            Holdings, signal history, paper trades, IPO applications, watchlists and your tuned profiles — one file.
            Credentials are excluded by the backend. Download before every deploy; a redeploy without a persistent disk
            wipes all of it.
          </div>
          <input type="password" value={token} onChange={e => setToken(e.target.value)}
            placeholder="BACKUP_TOKEN" autoComplete="off"
            style={{ ...inS, width: "100%", marginBottom: 8 }} />
          <div style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.55, marginBottom: 9 }}>
            The same value as <span style={{ fontFamily: T.mono }}>BACKUP_TOKEN</span> on the backend. It is kept on this
            device only — baking it into the build would publish it to anyone who opens the page.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={() => onBackup(token)} disabled={busy || !token} style={{ ...btn(), opacity: token ? 1 : .4 }}>Download backup</button>
            <label style={{ ...btn(), display: "inline-flex", alignItems: "center" }}>
              Restore from file…
              <input type="file" accept="application/json" style={{ display: "none" }} disabled={!token}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onRestoreFile(f, token); }} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── shell ───────────────────────────────────────────────────────── */
export default function Positions({ backendUrl, live }) {
  const api = useMemo(() => (backendUrl ? deskApi(backendUrl) : null), [backendUrl]);
  const [data, setData] = useState({ holdings: [], exits: [], armed: [], sell: [], buyBack: [], suppressed: [], conc: null, sizing: null });
  const [state, setState] = useState({ busy: true, err: "" });

  const load = useCallback(async () => {
    if (!api) return;
    setState(s => ({ ...s, busy: true }));
    const [holdings, exitRes, cycleRes, conc, sizing] = await Promise.all([
      api.holdings().then(r => r.holdings || []).catch(() => []),
      api.exitSignals().catch(() => null),
      api.cycleSignals().catch(() => null),
      api.concentration().catch(() => null),
      api.sizingConfig().catch(() => null),
    ]);
    setData({ holdings, exits: exitRes?.signals || [], armed: exitRes?.armed || [],
      sell: cycleRes?.sell || [], buyBack: cycleRes?.buyBack || [], suppressed: cycleRes?.suppressed || [],
      conc, sizing });
    setState({ busy: false, err: "" });
  }, [api]);

  useEffect(() => { load(); }, [load]);

  /* A fraction only becomes a quantity if the holding recorded one. Otherwise
     send nothing and let the backend keep the rupee figures null rather than
     inventing a size the user never gave. */
  const qtyFor = (sig, fraction) => {
    const h = data.holdings.find(x => x.id === sig.holdingId);
    const q = h?.qty ?? h?.cycle?.coreQty;
    return q ? Math.max(1, Math.round(q * fraction)) : undefined;
  };

  const act = async (fn) => {
    setState(s => ({ ...s, busy: true }));
    try { await fn(); await load(); }
    catch (e) { setState({ busy: false, err: e.message || "That did not work" }); }
  };

  if (!live) {
    return (
      <div style={{ border: "1px dashed " + T.line, borderRadius: 12, padding: "24px 20px", textAlign: "center", fontFamily: T.sans }}>
        <div style={{ fontSize: 13.5, color: T.ink }}>Positions needs the live backend.</div>
        <div style={{ fontSize: 12, color: T.mute, marginTop: 5, lineHeight: 1.6 }}>
          Holdings and their exit rules are evaluated server-side on every refresh, so they keep watching with this tab closed.
        </div>
      </div>
    );
  }

  const sorted = [...data.exits].sort((a, b) => (SEVERITY_ORDER[b.severity] || 0) - (SEVERITY_ORDER[a.severity] || 0));

  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      {state.err && (
        <div style={{ background: T.red + "10", border: "1px solid " + T.red + "44", borderRadius: 9, padding: "9px 11px", fontSize: 11.5, color: T.red, marginBottom: 10 }}>
          {state.err}
        </div>
      )}

      <Label accent={sorted.length ? T.red : T.brass}>
        {sorted.length ? `Exit signals · ${sorted.length}` : "Exit signals"}
      </Label>
      {!sorted.length ? (
        <div style={{ border: "1px dashed " + T.line, borderRadius: 10, padding: "16px 14px", fontSize: 12, color: T.dimSolid, marginBottom: 16 }}>
          No exit rule has fired on your open holdings. Rules keep running server-side every refresh.
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {sorted.map(s => (
            <ExitCard key={s.id} sig={s} busy={state.busy}
              onClose={(id, patch) => act(() => api.patchHolding(id, patch))}
              onDismiss={(id, rule) => act(() => api.dismiss(id, rule))} />
          ))}
        </div>
      )}

      {/* Trading around a core position. Below fired exit rules — a broken thesis
          outranks profit-taking — and above the holdings themselves. */}
      {(data.sell.length > 0 || data.buyBack.length > 0) && (
        <div style={{ marginBottom: 16 }}>
          <Label accent={T.amber}>Trim &amp; re-enter · {data.sell.length + data.buyBack.length}</Label>
          {data.sell.map(sig => (
            <CycleCard key={sig.id} sig={sig} busy={state.busy}
              onAct={(s2, f) => act(() => api.sold(s2.holdingId, f == null ? {} : { qty: qtyFor(s2, f) }))} />
          ))}
          {data.buyBack.map(sig => (
            <CycleCard key={sig.id} sig={sig} busy={state.busy}
              onAct={(s2, f) => act(() => api.boughtBack(s2.holdingId, f == null ? {} : { qty: qtyFor(s2, f) }))} />
          ))}
        </div>
      )}

      {/* A buy-back withheld because the trend broke is a finding. Silence would
          read as "no pullback yet" when it means "this is a falling knife". */}
      {data.suppressed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Label accent={T.dimSolid}>Withheld</Label>
          {data.suppressed.map((x, i) => (
            <div key={i} style={{ background: T.card, border: "1px dashed " + T.line, borderRadius: 9, padding: "9px 12px", marginBottom: 6 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{x.symbol}</span>
                <span style={{ fontSize: 12, color: T.amber }}>{x.reason}</span>
              </div>
              {x.detail && <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 4 }}>{x.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Armed but not fired. A trailing stop 2% away is worth seeing and is not
          a reason to act, so it gets no close button and no severity colour. */}
      {data.armed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Label accent={T.amber}>Armed · nothing broken yet</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {data.armed.map(a => (
              <div key={a.id} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 9, padding: "9px 12px" }}>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "baseline" }}>
                  <span style={{ fontFamily: T.mono, fontSize: 12, color: T.ink }}>{a.symbol}</span>
                  <span style={{ fontSize: 12, color: T.mute }}>{a.headline || a.rule}</span>
                  {a.distanceToTriggerPct != null && (
                    <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.amber, marginLeft: "auto" }}>
                      {Math.abs(a.distanceToTriggerPct).toFixed(1)}% away
                    </span>
                  )}
                </div>
                {(a.reasoning || a.rationale) && (
                  <div style={{ fontSize: 11.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 5 }}>{a.reasoning || a.rationale}</div>
                )}
                <div style={{ fontFamily: T.mono, fontSize: 9.5, color: T.dimSolid, marginTop: 5 }}>
                  {a.action || "watch"} · not triggered
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Label>Open holdings · {data.holdings.filter(h => h.status !== "closed").length}</Label>
      {!data.holdings.filter(h => h.status !== "closed").length ? (
        <div style={{ border: "1px dashed " + T.line, borderRadius: 10, padding: "16px 14px", fontSize: 12, color: T.dimSolid }}>
          Nothing marked. Tap <span style={{ color: T.brass }}>I&apos;m holding this</span> on any watchlist row — one tap, no form.
        </div>
      ) : data.holdings.filter(h => h.status !== "closed").map(h => (
        <HoldingRow key={h.id} h={h} exits={data.exits} armed={data.armed} busy={state.busy}
          onEdit={(id, patch) => act(() => api.patchHolding(id, patch))}
          onDrop={id => act(() => api.dropHolding(id))} />
      ))}

      <Concentration conc={data.conc} sizing={data.sizing} busy={state.busy}
        onSaveSizing={cfg => act(() => api.saveSizing(cfg))}
        onBackup={async (token) => {
          try {
            const data = await api.backup(token);
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
            a.download = `trinetra-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click(); URL.revokeObjectURL(a.href);
          } catch (e) { setState({ busy: false, err: "Backup failed — " + e.message }); }
        }}
        onRestoreFile={async (file, token) => {
          // Two deliberate acts: choosing the file, then confirming the overwrite.
          if (!window.confirm(`Restore from ${file.name}? This overwrites holdings, history and trades on the backend. The current state is saved to pre-restore.json first.`)) return;
          try {
            const payload = JSON.parse(await file.text());
            await api.restore(payload, token);
            await load();
            setState({ busy: false, err: "" });
          } catch (e) { setState({ busy: false, err: "Restore failed — " + e.message }); }
        }} />

      <p style={{ fontSize: 10.5, color: T.dimSolid, lineHeight: 1.6, marginTop: 20, textAlign: "center" }}>
        Exit rules are decision support. They describe what changed against the reason you marked the position —
        <span style={{ color: T.brass }}> the call is yours.</span>
      </p>
    </div>
  );
}
