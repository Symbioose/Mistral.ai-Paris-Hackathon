import type { Metadata } from "next";
import "./globals.css";
import "./conversation.css";
import { AuthProvider } from "@/app/providers/AuthProvider";

export const metadata: Metadata = {
  title: "YouGotIt — Pratiquer la conversation client",
  description: "Entraînez-vous à conduire un entretien client et progressez grâce à un retour précis sur vos échanges.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
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
