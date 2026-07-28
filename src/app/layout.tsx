import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";
import { Manrope } from "next/font/google";
import { SessionProvider } from "next-auth/react";

import { TRPCReactProvider } from "~/trpc/react";
import { ThemeProvider, themeInitScript } from "~/components/ui/theme";

export const metadata: Metadata = {
  title: "SnapSell",
  description: "SnapSell - Vente live",
  icons: [
    { rel: "icon", url: "/logo.png", type: "image/png" },
    { rel: "apple-touch-icon", url: "/logo.png" },
  ],
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `suppressHydrationWarning` : le script ci-dessous modifie la classe de <html>
    // avant l'hydratation, ce qui est précisément le but.
    <html lang="fr" className={`${geist.variable} ${manrope.variable}`} suppressHydrationWarning>
      <head>
        {/* Doit s'exécuter avant la première peinture, sinon l'écran clignote. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground transition-colors duration-300 [font-family:var(--font-manrope),Manrope,sans-serif]">
        <ThemeProvider>
          <SessionProvider>
            <TRPCReactProvider>{children}</TRPCReactProvider>
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
