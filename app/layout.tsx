import type { Metadata } from "next";
import "./globals.css";
import "./ui.css";
import { IBM_Plex_Mono, Newsreader, Schibsted_Grotesk } from "next/font/google";
import { AuthProvider } from "@/app/providers/AuthProvider";

const newsreader = Newsreader({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-newsreader", display: "swap" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "YouGotIt — Pratiquer la conversation client",
  description: "Entraînez-vous à conduire un entretien client et progressez grâce à un retour précis sur vos échanges.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${newsreader.variable} ${schibsted.variable} ${plexMono.variable}`}>
      <head>
        {/* Native ES modules for the 3D avatar, served from public/vendor (see scripts/vendor-avatar.mjs). */}
        <script
          type="importmap"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              imports: {
                three: "/vendor/three/three.module.js",
                "three/addons/": "/vendor/three/addons/",
              },
            }),
          }}
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
