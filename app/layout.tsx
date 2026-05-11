import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExamGuard — Online Examination Portal",
  description: "Secure, scalable online exam system. Anti-cheat protected with real-time monitoring.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#081224" />
        {/* Preconnect for fonts — non-blocking */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
          media="print"
          onLoad="this.media='all'"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
          />
        </noscript>
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.getRegistrations().then(function(regs) {
                    regs.forEach(function(r) { r.update(); });
                  });
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(reg) {
                      reg.addEventListener('updatefound', function() {
                        var nw = reg.installing;
                        if (nw) {
                          nw.addEventListener('statechange', function() {
                            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                              nw.postMessage({ type: 'SKIP_WAITING' });
                            }
                          });
                        }
                      });
                    })
                    .catch(function(e) { console.warn('[SW] Failed:', e); });
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
