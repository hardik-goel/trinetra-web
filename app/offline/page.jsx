/* Shown when a navigation happens with no network. It deliberately contains no
   numbers at all: anything that looked like a price here would be a price from
   an unknown time, which is worse than a blank screen in a trading app. */
export const metadata = { title: "Trinetra — offline" };

export default function Offline() {
  const T = { bg: "#0E0F0C", ink: "#EAE7DB", mute: "#9C9F8B", dim: "#636653", brass: "#C9A961" };
  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24,
      fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <div style={{ width: 54, height: 54, margin: "0 auto 18px", borderRadius: 99,
          border: "1px solid " + T.brass + "55", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 18, height: 3, borderRadius: 2, background: T.dim }} />
        </div>
        <h1 style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 30, fontWeight: 400, margin: "0 0 10px" }}>
          The eye is closed
        </h1>
        <p style={{ fontSize: 13.5, color: T.mute, lineHeight: 1.7, margin: "0 0 18px" }}>
          Trinetra needs a connection for live market data. Nothing is shown here on purpose —
          a cached price is a price from an unknown moment, and in a trading app that is worse
          than showing nothing at all.
        </p>
        <p style={{ fontSize: 12, color: T.dim, lineHeight: 1.6 }}>
          Reconnect and reload. Server-side alerts keep running without this screen open.
        </p>
      </div>
    </div>
  );
}
