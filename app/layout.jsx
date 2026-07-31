export const metadata = {
  title: "Trinetra — NSE Confluence Screener",
  description: "The eye opens when everything aligns.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0E0F0C" }}>{children}</body>
    </html>
  );
}
