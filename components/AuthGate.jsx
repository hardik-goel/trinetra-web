"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { authApi, setCsrf, setUnauthorizedHandler } from "../lib/api";

/* ================================================================
   THE DOOR.

   Backend a9d587b put the instance behind a session, so nothing else
   may render until two questions are answered: which form does this
   instance want, and is this browser already signed in.

   Three states, and the third is the one that is easy to forget:

     multi-user + signed in   → the app
     multi-user + anonymous   → sign in / sign up
     single-user              → the app, untouched. Instances with no
                                accounts still exist and still work;
                                treating that as "not signed in" would
                                lock the owner out of their own dev box.

   Every message the server sends is rendered as it arrives. The login
   failure in particular says the same thing for a wrong email and a
   wrong password on purpose — the form must not become a way to test
   whether an address has an account here. So: no "did you mean to sign
   up?", no separate email-not-found path, no cleverness.
   ================================================================ */

const T = {
  bg: "#0E0F0C", card: "#1A1C13", raised: "#20221799",
  line: "#2A2D1F", lineSoft: "#22241A",
  ink: "#EAE7DB", mute: "#9C9F8B", dim: "#63665381", dimSolid: "#636653",
  brass: "#C9A961", brassSoft: "#C9A9611F",
  green: "#86C08A", red: "#DC6A58", amber: "#D8B25C",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
  serif: "'Instrument Serif', Georgia, serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
};
export const AUTH_T = T;

const inS = {
  background: T.bg, border: "1px solid " + T.line, borderRadius: 8, color: T.ink,
  padding: "10px 12px", fontSize: 13, fontFamily: T.mono, outline: "none", width: "100%",
};
export const authBtn = (p, disabled) => ({
  padding: "10px 15px", borderRadius: 8,
  border: "1px solid " + (p ? T.brass : T.line),
  background: p ? T.brass : "transparent", color: p ? "#141206" : T.mute,
  fontSize: 12.5, fontWeight: p ? 600 : 400,
  cursor: disabled ? "default" : "pointer", opacity: disabled ? .45 : 1,
});

const Field = ({ label, hint, ...rest }) => (
  <label style={{ display: "block", marginBottom: 11 }}>
    <div style={{ fontFamily: T.mono, fontSize: 9, letterSpacing: 1.2, color: T.dimSolid, marginBottom: 4 }}>
      {label}
    </div>
    <input {...rest} style={inS} />
    {hint && <div style={{ fontSize: 10.5, color: T.dimSolid, marginTop: 4, lineHeight: 1.5 }}>{hint}</div>}
  </label>
);

/* The server's words, at the weight the status deserves. 429 is amber
   rather than red because it is a wait, not a mistake — and the copy
   says how long, so a retry button here would only shorten the wait in
   the user's head while lengthening it on the server. */
export function ServerMessage({ err }) {
  if (!err) return null;
  const tone = err.status === 429 || err.status === 503 ? T.amber : T.red;
  return (
    <div style={{ background: tone + "12", border: "1px solid " + tone + "55", borderLeft: "3px solid " + tone,
      borderRadius: 8, padding: "9px 12px", marginBottom: 11 }}>
      <div style={{ fontSize: 12, color: tone, lineHeight: 1.6 }}>{err.message}</div>
      {/* 400 on the password carries the reasoning about length. It is the
          useful half of the message and is never summarised away. */}
      {err.detail && (
        <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.6, marginTop: 5 }}>{err.detail}</div>
      )}
    </div>
  );
}

function Shell({ children, sub }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: T.sans,
      display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 18px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontFamily: T.serif, fontSize: 30, letterSpacing: .5 }}>Trinetra</div>
          {sub && <div style={{ fontSize: 11.5, color: T.dimSolid, marginTop: 5, lineHeight: 1.6 }}>{sub}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}

function SignIn({ api, cfg, onDone, onSwitch }) {
  const [f, setF] = useState({ email: "", password: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.login({ email: f.email.trim(), password: f.password });
      if (r.csrfToken) setCsrf(r.csrfToken);
      onDone(r);
    } catch (ex) {
      /* Never auto-retry a 429: the limiter counts attempts, so a retry
         extends the lockout the user is already inside. Show it, stop. */
      setErr(ex);
    } finally { setBusy(false); }
  };

  return (
    <Shell sub="Sign in to your instance.">
      <form onSubmit={submit} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: "18px 18px 16px" }}>
        <ServerMessage err={err} />
        <Field label="EMAIL" type="email" autoComplete="username" required
          value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <Field label="PASSWORD" type="password" autoComplete="current-password" required
          value={f.password} onChange={e => setF({ ...f, password: e.target.value })} />
        <button type="submit" disabled={busy || !f.email || !f.password}
          style={{ ...authBtn(true, busy || !f.email || !f.password), width: "100%", marginTop: 3 }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      {cfg?.signupEnabled && (
        <div style={{ textAlign: "center", marginTop: 13, fontSize: 11.5, color: T.dimSolid }}>
          <button onClick={onSwitch} style={{ all: "unset", cursor: "pointer", color: T.brass, textDecoration: "underline" }}>
            Create an account
          </button>
          {cfg.inviteRequired && " — you will need an invite code."}
        </div>
      )}
    </Shell>
  );
}

function SignUp({ api, cfg, onDone, onSwitch }) {
  const [f, setF] = useState({ email: "", password: "", invite: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const min = cfg?.passwordMinLength ?? 10;
  /* firstRun means no account exists yet, so there is nobody to have
     issued an invite. Showing the field would ask for something that
     cannot exist. */
  const needsInvite = !!cfg?.inviteRequired && !cfg?.firstRun;
  const tooShort = f.password.length > 0 && f.password.length < min;
  const ready = f.email && f.password.length >= min && (!needsInvite || f.invite.trim());

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const r = await api.signup({
        email: f.email.trim(), password: f.password,
        ...(needsInvite ? { invite: f.invite.trim() } : {}),
      });
      if (r.csrfToken) setCsrf(r.csrfToken);
      onDone(r);
    } catch (ex) { setErr(ex); }
    finally { setBusy(false); }
  };

  return (
    <Shell sub={cfg?.firstRun ? "No account exists on this instance yet." : "Create an account."}>
      <form onSubmit={submit} style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: "18px 18px 16px" }}>
        {/* Said plainly, before the form. Becoming the owner is not a
            detail to discover afterwards from a 403. */}
        {cfg?.firstRun && (
          <div style={{ background: T.brassSoft, border: "1px solid " + T.brass + "44", borderLeft: "3px solid " + T.brass,
            borderRadius: 8, padding: "9px 12px", marginBottom: 12, fontSize: 11.5, color: T.ink, lineHeight: 1.6 }}>
            This is the first account and becomes the owner. It is the only account that can issue
            invites, see the user list, or disable anyone.
          </div>
        )}
        {cfg?.note && (
          <div style={{ fontSize: 11, color: T.mute, lineHeight: 1.6, marginBottom: 11 }}>{cfg.note}</div>
        )}
        <ServerMessage err={err} />
        <Field label="EMAIL" type="email" autoComplete="username" required
          value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <Field label="PASSWORD" type="password" autoComplete="new-password" required
          value={f.password} onChange={e => setF({ ...f, password: e.target.value })}
          hint={`At least ${min} characters.`} />
        {/* Checked here to save a round trip, never to overrule: the
            server's 400 explains why length beats symbols and that
            reasoning is the part worth reading. */}
        {tooShort && (
          <div style={{ fontSize: 11, color: T.amber, marginTop: -6, marginBottom: 10 }}>
            {f.password.length} of {min} characters.
          </div>
        )}
        {needsInvite && (
          <Field label="INVITE CODE" required value={f.invite}
            onChange={e => setF({ ...f, invite: e.target.value.toUpperCase() })}
            hint="From the instance owner. Single use." />
        )}
        <button type="submit" disabled={busy || !ready}
          style={{ ...authBtn(true, busy || !ready), width: "100%", marginTop: 3 }}>
          {busy ? "Creating…" : cfg?.firstRun ? "Create the owner account" : "Create account"}
        </button>
      </form>
      <div style={{ textAlign: "center", marginTop: 13, fontSize: 11.5, color: T.dimSolid }}>
        <button onClick={onSwitch} style={{ all: "unset", cursor: "pointer", color: T.brass, textDecoration: "underline" }}>
          I already have an account
        </button>
      </div>
    </Shell>
  );
}

/**
 * Renders `children(session)` once the instance has been asked what it
 * wants. `session` is { mode, user, isAdmin, refresh, signOut }, and in
 * single-user mode user is null and nothing else changes.
 */
export default function AuthGate({ backendUrl, children }) {
  const api = useMemo(() => (backendUrl ? authApi(backendUrl) : null), [backendUrl]);
  const [boot, setBoot] = useState({ state: "loading", cfg: null, me: null, err: null });
  const [screen, setScreen] = useState("signin");

  const probe = useCallback(async () => {
    if (!api) { setBoot({ state: "nobackend", cfg: null, me: null, err: null }); return; }
    setBoot(b => ({ ...b, state: b.state === "ready" ? "ready" : "loading", err: null }));
    let cfg = null;
    try {
      cfg = await api.config();
    } catch (e) {
      /* A backend that predates accounts has no /auth/config. That is
         not an error — it is single-user, which is a supported mode.
         Anything else is a real failure and must not be papered over
         into "signed out", which would show a login form the instance
         cannot service. */
      if (e.status === 404) cfg = { mode: "single-user" };
      else { setBoot({ state: "error", cfg: null, me: null, err: e }); return; }
    }
    if (cfg.mode === "single-user") {
      setBoot({ state: "ready", cfg, me: null, err: null });
      return;
    }
    try {
      const me = await api.me();
      if (me.csrfToken) setCsrf(me.csrfToken);
      setBoot({ state: "ready", cfg, me, err: null });
    } catch (e) {
      setCsrf(null);
      if (e.status === 401) {
        setBoot({ state: "anon", cfg, me: null, err: null });
        setScreen(cfg.firstRun ? "signup" : "signin");
      } else {
        setBoot({ state: "error", cfg, me: null, err: e });
      }
    }
  }, [api]);

  useEffect(() => { probe(); }, [probe]);

  /* Any call anywhere can come back 401 — a session expiring mid-poll
     looks exactly like this. Re-probing rather than assuming keeps the
     single-user case from being dumped onto a login form it has no
     accounts for. */
  useEffect(() => {
    setUnauthorizedHandler(() => { setCsrf(null); probe(); });
    return () => setUnauthorizedHandler(null);
  }, [probe]);

  const signOut = useCallback(async () => {
    try { await api?.logout(); } catch { /* the cookie is gone either way */ }
    setCsrf(null);
    probe();
  }, [api, probe]);

  if (boot.state === "loading") {
    return <Shell sub="Checking your session…"><div /></Shell>;
  }

  if (boot.state === "error") {
    const waking = !boot.err?.status;
    return (
      <Shell sub={null}>
        <div style={{ background: T.card, border: "1px solid " + T.line, borderRadius: 12, padding: "18px" }}>
          <div style={{ fontSize: 13, color: T.ink, marginBottom: 6 }}>
            {waking ? "The backend is not answering." : "The backend refused the check."}
          </div>
          <div style={{ fontSize: 11.5, color: T.mute, lineHeight: 1.6 }}>
            {boot.err?.message || "No response."}
            {waking && " A sleeping free instance takes about 30 seconds to wake."}
          </div>
          <button onClick={probe} style={{ ...authBtn(true), width: "100%", marginTop: 13 }}>Try again</button>
        </div>
      </Shell>
    );
  }

  if (boot.state === "anon") {
    const props = { api, cfg: boot.cfg, onDone: probe };
    return screen === "signup"
      ? <SignUp {...props} onSwitch={() => setScreen("signin")} />
      : <SignIn {...props} onSwitch={() => setScreen("signup")} />;
  }

  // ready — multi-user signed in, or single-user
  const session = {
    mode: boot.cfg?.mode || "single-user",
    user: boot.me?.user || null,
    isAdmin: !!boot.me?.user?.isAdmin,
    refresh: probe,
    signOut,
  };
  return children(session);
}
