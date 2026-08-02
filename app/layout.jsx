import Pwa from "../components/Pwa";

export const metadata = {
  title: "Trinetra — NSE Confluence Screener",
  description: "The eye opens when everything aligns.",
  applicationName: "Trinetra",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Trinetra",
    // Translucent lets the warm-black body run under the status bar; with
    // viewport-fit=cover and the safe-area padding below, nothing is clipped.
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: "#0E0F0C",
  width: "device-width",
  initialScale: 1,
  // Required for env(safe-area-inset-*) to report real values on iPhone.
  viewportFit: "cover",
};

/* The html element carries the background too: iOS paints the rubber-band
   overscroll area from <html>, so without this a pull past the top flashes
   white above a black app. */
const shellCss = `
  html { background: #0E0F0C; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #0E0F0C; }
  /* Standalone only: reclaim the notch and home-indicator space so the sticky
     header and the bottom of drawers are never under system furniture. */
  @media all and (display-mode: standalone) {
    body {
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
  }
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head><style dangerouslySetInnerHTML={{ __html: shellCss }} /></head>
      <body style={{ margin: 0, background: "#0E0F0C" }}>
        {children}
        <Pwa />
      </body>
    </html>
  );
}
