"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { authApi } from "../lib/api";
import { AUTH_T as T, authBtn, ServerMessage } from "./AuthGate";

/* ================================================================
   ACCOUNT · ALERTS · OWNER

   Three panels that only exist once the instance has accounts. Each
   renders the server's own wording for every failure, and each is
   explicit about the thing it cannot undo:

     · a new password signs out every OTHER device, not this one
     · an invite code is shown once and only its hash is kept
     · a masked credential submitted unchanged means "leave it alone",
       so the input starts empty rather than pre-filled with ••••1234
       — a mask in a text box looks like a value, and a user who edits
       around it ends up sending the mask as the token
   ================================================================ */

const inS = {
  background: T.bg, border: "1px solid " + T.line, borderRadius: 8, color: T.ink,
  padding: "9px 11px", fontSize: 12.5, fontFamily: T.mono, outline: "none", width: "100%",
};
const Label = ({ children }) => (
  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5, color: T.brass,
    margin: "18px 0 9px", textTransform: "uppercase" }}>{children}</div>
);
const Field = ({ label, hint, ...rest }) => (
  <label style={{ display: "block", marginBottom: 10 }}>
    <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid, marginBottom: 4 }}>{label}</div>
    <input {...rest} style={inS} />
    {hint && <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
  </label>
);
const Card = ({ children }) => (
  <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 10, padding: "13px 14px" }}>{children}</div>
);
const Note = ({ children, tone }) => (
  <div style={{ fontSize: 11.5, color: tone || T.mute, lineHeight: 1.6, marginTop: 7 }}>{children}</div>
);
const when = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  return Number.isNaN(+d) ? String(ts) : d.toLocaleString("en-IN", { hour12: false });
};

/* ── password + sessions ─────────────────────────────────────────── */
export function AccountPanel({ backendUrl, session }) {
  const api = useMemo(() => authApi(backendUrl), [backendUrl]);
  const [f, setF] = useState({ currentPassword: "", newPassword: "" });
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState(null);
  const [sErr, setSErr] = useState(null);

  const loadSessions = useCallback(() => {
    api.sessions().then(r => { setSessions(Array.isArray(r) ? r : r?.sessions || []); setSErr(null); })
       .catch(e => { setSessions([]); setSErr(e); });
  }, [api]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const change = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null); setMsg("");
    try {
      await api.changePassword(f);
      setF({ currentPassword: "", newPassword: "" });
      setMsg("Password changed. Every other signed-in device has been signed out; this one is still in.");
      loadSessions();
    } catch (ex) { setErr(ex); }
    finally { setBusy(false); }
  };

  const revokeOthers = async () => {
    setBusy(true); setErr(null); setMsg("");
    try { await api.revokeOthers(); setMsg("Every other device has been signed out."); loadSessions(); }
    catch (ex) { setErr(ex); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <div style={{ fontFamily: T.mono, fontSize: 11, color: T.mute }}>
        {session?.user?.email}
        {session?.isAdmin && <span style={{ color: T.brass }}> · owner</span>}
      </div>

      <Label>Change password</Label>
      <Card>
        <form onSubmit={change}>
          <ServerMessage err={err} />
          {msg && <Note tone={T.green}>{msg}</Note>}
          <Field label="CURRENT PASSWORD" type="password" autoComplete="current-password" required
            value={f.currentPassword} onChange={e => setF({ ...f, currentPassword: e.target.value })} />
          <Field label="NEW PASSWORD" type="password" autoComplete="new-password" required
            value={f.newPassword} onChange={e => setF({ ...f, newPassword: e.target.value })} />
          {/* Stated before the button, not after the fact. */}
          <Note>Changing it signs out every other device. This one stays signed in.</Note>
          <button type="submit" disabled={busy || !f.currentPassword || !f.newPassword}
            style={{ ...authBtn(true, busy || !f.currentPassword || !f.newPassword), marginTop: 10 }}>
            {busy ? "…" : "Change password"}
          </button>
        </form>
      </Card>

      <Label>Where you are signed in</Label>
      <Card>
        {sErr && <ServerMessage err={sErr} />}
        {sessions == null ? (
          <div style={{ fontSize: 12, color: T.dimSolid }}>Reading…</div>
        ) : !sessions.length ? (
          <div style={{ fontSize: 12, color: T.dimSolid }}>No sessions reported.</div>
        ) : sessions.map(s => (
          <div key={s.ref} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
            padding: "7px 0", borderBottom: "1px solid " + T.lineSoft }}>
            <span style={{ fontFamily: T.mono, fontSize: 10.5, color: s.current ? T.green : T.mute }}>
              {s.current ? "this device" : s.ref}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>{when(s.lastSeen)}</span>
            <span style={{ fontSize: 10.5, color: T.dimSolid, flex: 1, minWidth: 140, wordBreak: "break-word" }}>
              {s.userAgent || "—"}{s.ip ? ` · ${s.ip}` : ""}
            </span>
          </div>
        ))}
        <button onClick={revokeOthers} disabled={busy} style={{ ...authBtn(false, busy), marginTop: 11 }}>
          Sign out every other device
        </button>
      </Card>

      <Label>This device</Label>
      <Card>
        <button onClick={session.signOut} style={authBtn(false)}>Sign out</button>
        <Note>The session is a cookie the server sets; signing out revokes it server-side, not just here.</Note>
      </Card>
    </div>
  );
}

/* ── per-user Telegram ───────────────────────────────────────────── */
export function AlertPrefsPanel({ backendUrl }) {
  const api = useMemo(() => authApi(backendUrl), [backendUrl]);
  const [prefs, setPrefs] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  /* Bound to empty, always. The server returns ••••1234 and submitting
     that back means "unchanged" — but rendering it inside the input
     makes it look like the stored value, and anything typed after it
     becomes a token with a mask glued to the front. */
  const [typed, setTyped] = useState({ telegramToken: "", telegramChatId: "" });

  const load = useCallback(() => {
    api.prefs().then(p => { setPrefs(p); setErr(null); }).catch(e => { setPrefs(null); setErr(e); });
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const save = async (extra) => {
    setBusy(true); setErr(null); setMsg("");
    try {
      // Only what was actually typed. An untouched field is not sent at all,
      // which is how "leave it alone" is expressed.
      const body = { ...extra };
      if (typed.telegramToken.trim()) body.telegramToken = typed.telegramToken.trim();
      if (typed.telegramChatId.trim()) body.telegramChatId = typed.telegramChatId.trim();
      const p = await api.savePrefs(body);
      setPrefs(p && typeof p === "object" && "telegram" in p ? p : null);
      setTyped({ telegramToken: "", telegramChatId: "" });
      setMsg("Saved.");
      if (!(p && "telegram" in p)) load();
    } catch (ex) { setErr(ex); }
    finally { setBusy(false); }
  };

  const test = async () => {
    setBusy(true); setErr(null); setMsg("");
    try { await api.testAlert(); setMsg("Sent. If nothing arrives, the token or chat id is wrong — Telegram accepts the call either way."); }
    catch (ex) { setErr(ex); }
    finally { setBusy(false); }
  };

  const tg = prefs?.telegram;
  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <div style={{ fontSize: 12, color: T.mute, lineHeight: 1.65 }}>
        Your own bot and your own chat. Alerts for your universe go here and nowhere else.
      </div>

      <Label>Telegram</Label>
      <Card>
        <ServerMessage err={err} />
        {msg && <Note tone={T.green}>{msg}</Note>}
        {prefs == null && !err ? (
          <div style={{ fontSize: 12, color: T.dimSolid }}>Reading…</div>
        ) : (
          <>
            <div style={{ fontFamily: T.mono, fontSize: 10.5, color: tg?.configured ? T.green : T.amber, marginBottom: 10 }}>
              {tg?.configured
                ? `armed · token ${tg.tokenMasked || "••••"} · chat ${tg.chatIdMasked || "••••"}`
                : "not armed — alerts will not be sent"}
            </div>
            <Field label="BOT TOKEN" placeholder={tg?.tokenMasked ? `leave blank to keep ${tg.tokenMasked}` : "123456:ABC…"}
              value={typed.telegramToken} onChange={e => setTyped({ ...typed, telegramToken: e.target.value })} />
            <Field label="CHAT ID" placeholder={tg?.chatIdMasked ? `leave blank to keep ${tg.chatIdMasked}` : "-1001234567890"}
              value={typed.telegramChatId} onChange={e => setTyped({ ...typed, telegramChatId: e.target.value })} />
            <Note>A blank field is left as it is. Only what you type is sent.</Note>

            <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}>
              <button onClick={() => save()} disabled={busy} style={authBtn(true, busy)}>Save</button>
              <button onClick={test} disabled={busy || !tg?.configured} style={authBtn(false, busy || !tg?.configured)}>
                Send test message
              </button>
            </div>

            <Label>Which alerts</Label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: T.mute, cursor: "pointer" }}>
              <input type="checkbox" checked={!!prefs?.alertsOn} disabled={busy}
                onChange={e => save({ alertsOn: e.target.checked })} />
              Send me alerts
            </label>
            {Array.isArray(prefs?.alertProfiles) && (
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid, marginTop: 7 }}>
                profiles: {prefs.alertProfiles.length ? prefs.alertProfiles.join(" · ") : "all enabled"}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

/* ── owner only ──────────────────────────────────────────────────── */
export function OwnerPanel({ backendUrl }) {
  const api = useMemo(() => authApi(backendUrl), [backendUrl]);
  const [invites, setInvites] = useState(null);
  const [users, setUsers] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ days: 7, note: "" });
  /* Held in state until dismissed, because the server keeps only a hash.
     Re-rendering the list will not bring it back and neither will the
     backend — so it does not disappear on the next fetch. */
  const [fresh, setFresh] = useState(null);

  const load = useCallback(() => {
    api.invites().then(r => setInvites(Array.isArray(r) ? r : r?.invites || [])).catch(e => { setInvites([]); setErr(e); });
    api.users().then(r => setUsers(Array.isArray(r) ? r : r?.users || [])).catch(e => { setUsers([]); setErr(e); });
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api.createInvite({ days: +draft.days || undefined, note: draft.note.trim() || undefined });
      setFresh(r); setDraft({ days: 7, note: "" }); load();
    } catch (ex) { setErr(ex); }
    finally { setBusy(false); }
  };

  const setStatus = async (id, status) => {
    setBusy(true); setErr(null);
    try { await api.setUserStatus(id, status); load(); }
    catch (ex) { setErr(ex); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ fontFamily: T.sans, color: T.ink }}>
      <ServerMessage err={err} />

      <Label>Invite someone</Label>
      <Card>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ flex: "0 0 96px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid, marginBottom: 4 }}>VALID DAYS</div>
            <input type="number" min={1} max={90} value={draft.days}
              onChange={e => setDraft({ ...draft, days: e.target.value })} style={inS} />
          </label>
          <label style={{ flex: "1 1 170px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid, marginBottom: 4 }}>NOTE</div>
            <input value={draft.note} placeholder="who it is for"
              onChange={e => setDraft({ ...draft, note: e.target.value })} style={inS} />
          </label>
          <button onClick={create} disabled={busy} style={authBtn(true, busy)}>Generate</button>
        </div>

        {fresh?.code && (
          <div style={{ marginTop: 12, background: T.brassSoft, border: "1px solid " + T.brass + "55",
            borderLeft: "3px solid " + T.brass, borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.brass, marginBottom: 5 }}>
              COPY THIS NOW
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 18, letterSpacing: 2, color: T.ink }}>{fresh.code}</div>
            <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6, marginTop: 6 }}>
              {fresh.warning || "Shown once. Only a hash is stored, so it cannot be recovered — generate a new one if you lose it."}
              {fresh.expiresInDays != null && ` Valid ${fresh.expiresInDays} day${fresh.expiresInDays === 1 ? "" : "s"}.`}
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
              <button onClick={() => navigator.clipboard?.writeText(fresh.code)} style={authBtn(false)}>Copy</button>
              <button onClick={() => setFresh(null)} style={authBtn(false)}>I have it</button>
            </div>
          </div>
        )}
      </Card>

      <Label>Invites</Label>
      <Card>
        {invites == null ? <div style={{ fontSize: 12, color: T.dimSolid }}>Reading…</div>
          : !invites.length ? <div style={{ fontSize: 12, color: T.dimSolid }}>None issued.</div>
          : invites.map(i => (
            <div key={i.ref} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
              padding: "6px 0", borderBottom: "1px solid " + T.lineSoft, fontSize: 11.5 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10.5, color: T.mute }}>{i.ref}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10,
                color: i.used ? T.dimSolid : i.expired ? T.amber : T.green }}>
                {i.used ? "used" : i.expired ? "expired" : "open"}
              </span>
              <span style={{ color: T.dimSolid, fontSize: 10.5 }}>expires {when(i.expires_at)}</span>
              {i.note && <span style={{ color: T.mute, flex: 1, minWidth: 100 }}>{i.note}</span>}
            </div>
          ))}
      </Card>

      <Label>Accounts</Label>
      <Card>
        {users == null ? <div style={{ fontSize: 12, color: T.dimSolid }}>Reading…</div>
          : !users.length ? <div style={{ fontSize: 12, color: T.dimSolid }}>No accounts.</div>
          : users.map(u => (
            <div key={u.id} style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap",
              padding: "7px 0", borderBottom: "1px solid " + T.lineSoft, fontSize: 12 }}>
              <span style={{ color: T.ink, flex: "1 1 160px", wordBreak: "break-all" }}>{u.email}</span>
              {u.is_admin && <span style={{ fontFamily: T.mono, fontSize: 9, color: T.brass }}>owner</span>}
              <span style={{ fontFamily: T.mono, fontSize: 10,
                color: u.status === "disabled" ? T.red : T.green }}>{u.status}</span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>
                {u.symbols != null ? `${u.symbols} symbols` : ""}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.dimSolid }}>
                {u.last_login_at ? `seen ${when(u.last_login_at)}` : "never signed in"}
              </span>
              {!u.is_admin && (
                <button disabled={busy}
                  onClick={() => setStatus(u.id, u.status === "disabled" ? "active" : "disabled")}
                  style={{ ...authBtn(false, busy), padding: "4px 9px", fontSize: 11 }}>
                  {u.status === "disabled" ? "Enable" : "Disable"}
                </button>
              )}
            </div>
          ))}
      </Card>
    </div>
  );
}
