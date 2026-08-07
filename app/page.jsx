"use client";
import Trinetra from "../components/Trinetra";
import AuthGate from "../components/AuthGate";

/* The gate resolves the backend the same way the app does. With no
   backend configured there is nothing to authenticate against and the
   app runs on demo data, so the gate steps aside rather than showing a
   login form no instance can service. */
const BACKEND =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_BACKEND_URL) || "";

export default function Page() {
  if (!BACKEND) return <Trinetra session={{ mode: "single-user", user: null, isAdmin: false }} />;
  return <AuthGate backendUrl={BACKEND}>{session => <Trinetra session={session} />}</AuthGate>;
}
