import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RATP Survival — L'Odyssée Souterraine",
  description: "Survivez dans le métro parisien un jour de grève générale. Un RPG vocal propulsé par Mistral AI.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
