import Guide from "../../components/Guide";

export const metadata = {
  title: "Trinetra — the manual",
  description: "How to navigate Trinetra: profiles, signals, exits, the morning brief, the track record, and what the app refuses to do.",
};

export default function Docs() {
  return (
    <div style={{ minHeight: "100vh", background: "#0E0F0C", padding: "28px 18px 70px" }}>
      <Guide page />
      <div style={{ maxWidth: 780, margin: "0 auto", textAlign: "center" }}>
        <a href="/" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, color: "#C9A961", textDecoration: "none" }}>
          ← open the instrument
        </a>
      </div>
    </div>
  );
}
