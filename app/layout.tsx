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
        {/* Non-blocking Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Orbitron:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        {children}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(reg) { 
                      console.log('[SW] Registered:', reg.scope);
                      
                      // Check for updates every 15 minutes
                      setInterval(() => { reg.update(); }, 15 * 60 * 1000);

                      reg.onupdatefound = () => {
                        const newWorker = reg.installing;
                        if (newWorker) {
                          newWorker.onstatechange = () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                              // New update available and installed - force reload to apply
                              console.log('[SW] New version found! Reloading...');
                              window.location.reload();
                            }
                          };
                        }
                      };
                    })
                    .catch(function(err) { console.warn('[SW] Registration failed:', err); });
                });

                // Handle controller change (e.g. after skipWaiting)
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                  if (refreshing) return;
                  refreshing = true;
                  window.location.reload();
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
