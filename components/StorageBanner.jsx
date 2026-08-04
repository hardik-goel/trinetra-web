"use client";
import React, { useState } from "react";

/* ================================================================
   STORAGE STATE — whether anything the user accrues survives.

   The backend keeps data/ in a private GitHub repo. When that is not
   configured, or configured and failing, everything hand-made — typed
   analyst calls, the edited universe, tuned criteria, the alert ledger,
   signal history — is one redeploy from gone.

   This banner is deliberately not dismissible. A dismissed warning about
   silent data loss is the same as no warning: the user clears it, keeps
   typing calls into the app for a week, and loses them anyway. It goes
   away by being fixed, not by being acknowledged.

   `detail` and `fix` are written by the backend to be rendered as-is, so
   they are rendered as-is. Paraphrasing them here would mean two places
   describe the failure and only one of them is right.
   ================================================================ */

const T = {
  card: "#1A1C13", line: "#2A2D1F",
  ink: "#EAE7DB", mute: "#9C9F8B", dimSolid: "#636653",
  brass: "#C9A961",
  red: "#DC6A58", redSoft: "#DC6A5814",
  amber: "#D8B25C", amberSoft: "#D8B25C14",
  green: "#86C08A",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};

const ago = (ts) => {
  if (!ts) return null;
  const s = Math.max(0, Math.round((Date.now() - Number(ts)) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 36 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

/* ── the banner ── */
export default function StorageBanner({ storage, onFlush }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (!storage || storage.mode === "durable") return null;

  const degraded = storage.mode === "degraded";
  /* Both states are red. Degraded is not the milder one — a store that looks
     configured while it has quietly stopped pushing is worse than none, because
     the user has reason to trust it. */
  const tone = T.red, wash = T.redSoft;
  const pending = storage.pendingFiles || [];

  const retry = async () => {
    setBusy(true); setResult(null);
    try {
      const r = await onFlush();
      const pushed = (r?.pushed || []).length, failed = (r?.failed || []).length;
      setResult(failed
        ? `${failed} still failing${pushed ? ` · ${pushed} pushed` : ""} — ${r?.status?.detail || "check the token's repo permissions"}`
        : pushed ? `${pushed} file${pushed === 1 ? "" : "s"} pushed — the store is current.`
        : "Nothing was pending to push.");
    } catch (e) {
      setResult(`Retry failed — ${e.message}`);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ fontFamily: T.sans, marginTop: 14, background: wash,
      border: "1px solid " + tone + "4A", borderLeft: "3px solid " + tone, borderRadius: 9, padding: "11px 13px" }}>

      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: 9.5, letterSpacing: 1.4, color: tone }}>
          {degraded ? "STORAGE FAILING" : "NOTHING IS SAVED"}
        </span>
        <span style={{ fontSize: 12.5, color: T.ink, fontWeight: 500 }}>
          {degraded
            ? "The backup has stopped persisting."
            : "Everything you have entered is lost on the next redeploy."}
        </span>
      </div>

      {/* Verbatim from the backend — it owns the description of its own failure. */}
      {storage.detail && (
        <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.6, marginTop: 6 }}>{storage.detail}</div>
      )}

      {/* What exists on that one instance's disk and nowhere else. Naming the
          files is the difference between an abstract warning and knowing that
          the analyst calls typed this morning are the thing at risk. */}
      {degraded && pending.length > 0 && (
        <div style={{ marginTop: 8, padding: "7px 9px", borderRadius: 7, background: "#00000033", border: "1px solid " + T.line }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.1, color: T.dimSolid, marginBottom: 4 }}>
            ON THAT INSTANCE'S DISK ONLY — {pending.length}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 10.5, color: T.ink, lineHeight: 1.7, wordBreak: "break-all" }}>
            {pending.join(" · ")}
          </div>
        </div>
      )}

      {storage.fix && (
        <div style={{ marginTop: 8, fontFamily: T.mono, fontSize: 10.5, color: T.brass, lineHeight: 1.7 }}>
          {storage.fix}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 9 }}>
        {storage.repo && (
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>
            {storage.repo}{storage.branch ? `#${storage.branch}` : ""}
            {storage.failures ? ` · ${storage.failures} failure${storage.failures === 1 ? "" : "s"}` : ""}
            {storage.lastPushAt ? ` · last push ${ago(storage.lastPushAt)}` : " · never pushed"}
          </span>
        )}
        {degraded && onFlush && (
          <button onClick={retry} disabled={busy} style={{
            marginLeft: "auto", padding: "6px 11px", borderRadius: 7, border: "1px solid " + tone,
            background: "transparent", color: tone, fontSize: 11.5, cursor: busy ? "default" : "pointer",
            opacity: busy ? .5 : 1 }}>
            {busy ? "Retrying…" : "Retry push"}
          </button>
        )}
      </div>

      {result && (
        <div style={{ fontSize: 11.5, color: /fail|still/i.test(result) ? tone : T.green, marginTop: 7, lineHeight: 1.55 }}>
          {result}
        </div>
      )}
    </div>
  );
}

/* ── proof the mechanism worked ──
   Shown once per boot. Files coming back after a redeploy is the only visible
   evidence the store is doing its job, and it is worth seeing exactly once —
   a permanent "restored 7 files" line would be noise within a day. */
export function RestoredNote({ storage }) {
  const files = storage?.adoptedAtBoot || [];
  const key = files.length ? "trinetra.restored." + files.length + "." + (storage.lastPushAt || "0") : null;

  /* Read from localStorage in an effect, not a useState initializer. `storage`
     arrives from the network after first paint, so an initializer would run
     while it is still null and latch the note off permanently. `checked` keeps
     an already-dismissed note from flashing before the lookup completes. */
  const [seen, setSeen] = useState({ checked: false, dismissed: false });
  React.useEffect(() => {
    if (!key) return;
    let was = false;
    try { was = localStorage.getItem(key) === "1"; } catch {}
    setSeen({ checked: true, dismissed: was });
  }, [key]);

  if (!key || !seen.checked || seen.dismissed) return null;
  const dismiss = () => {
    try { localStorage.setItem(key, "1"); } catch {}
    setSeen({ checked: true, dismissed: true });
  };

  return (
    <div style={{ fontFamily: T.sans, marginTop: 14, background: T.card, border: "1px solid " + T.line,
      borderLeft: "3px solid " + T.green, borderRadius: 9, padding: "9px 12px",
      display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: T.ink }}>
        Restored {files.length} file{files.length === 1 ? "" : "s"} from the backup after a restart.
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, flex: 1, minWidth: 0 }}>
        {files.join(" · ")}
      </span>
      <button onClick={dismiss} style={{ padding: "3px 8px", borderRadius: 6, border: "1px solid " + T.line,
        background: "transparent", color: T.mute, fontSize: 11, cursor: "pointer" }}>Got it</button>
    </div>
  );
}

/* ── the quiet version, for the backup section in Positions ──
   When the store is healthy there is no banner, but "is this actually on"
   should still be answerable without opening the backend. */
export function StorageLine({ storage }) {
  if (!storage) return null;
  const ok = storage.mode === "durable";
  return (
    <div style={{ fontFamily: T.mono, fontSize: 10, color: ok ? T.dimSolid : T.red, lineHeight: 1.7, marginTop: 6 }}>
      {ok
        ? <>Durable · {storage.repo || "configured"}{storage.branch ? `#${storage.branch}` : ""}
            {storage.lastPushAt ? ` · last push ${ago(storage.lastPushAt)}` : " · no push yet"}
            {storage.pushes ? ` · ${storage.pushes} total` : ""}</>
        : <>{storage.mode === "degraded" ? "Storage failing" : "No durable store"} — this backup file is the only copy that leaves the server.</>}
    </div>
  );
}
