import type { Metadata } from "next";
import { QueryProvider } from "@/components/providers/query-provider";
import { ServiceProvider } from "@/lib/di/service-provider";
import { GlobalErrorBoundary } from "@/components/error-boundary/global-error-boundary";
import { registerServices } from "@/services/register-services";
import "./globals.css";
import "@/styles/auris-theme.css";
// Loaded LAST so the redesign tokens + structural overrides win the cascade.
import "@/styles/auris-redesign.css";

// Register services on module load
registerServices();

export const metadata: Metadata = {
  title: "Auris",
  description: "Auris — language learning through listening and shadowing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* App Router has no pages/_document.js, so this rule is a false positive here.
            Loading fonts globally in the root layout is the intended App Router pattern. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,wght@0,300;0,400;0,500;0,600;1,400&family=Noto+Serif+SC:wght@300;400;500;600&family=Noto+Sans+SC:wght@300;400;500;600;700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <GlobalErrorBoundary>
          <ServiceProvider>
            <QueryProvider>
              <div className="app-shell">
                <div className="app-shell__body">{children}</div>
              </div>
            </QueryProvider>
          </ServiceProvider>
        </GlobalErrorBoundary>
      </body>
    </html>
  );
}
