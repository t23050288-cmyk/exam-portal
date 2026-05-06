import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ExamGuard — Online Examination Portal",
  description:
    "Secure, scalable online exam system for 266 concurrent students. Anti-cheat protected with real-time monitoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body className="">{children}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js')
                  .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
                  .catch(function(err) { console.warn('[SW] Registration failed:', err); });
              });
            }
          `,
        }}
      />
      </body>
    </html>
  );
}
