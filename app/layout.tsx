import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG to RPG — Serious Game Generator",
  description: "Transformez un document d'entreprise en simulation vocale adaptative avec évaluation des compétences.",
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
