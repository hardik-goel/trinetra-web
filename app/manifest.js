/* Served by Next at /manifest.webmanifest. Colours match the shell exactly so the
   splash screen and status bar are the same warm black as the app — a white flash
   on launch is the fastest way to make an installed app feel like a web page. */
export default function manifest() {
  return {
    name: "Trinetra — NSE Confluence Screener",
    short_name: "Trinetra",
    description: "The eye opens when everything aligns. NSE confluence screener with exit signals, IPO intelligence and a measured track record.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Preferred, not enforced: locking a tablet to portrait is hostile.
    orientation: "portrait-primary",
    background_color: "#0E0F0C",
    theme_color: "#0E0F0C",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
