import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/app/providers/AuthProvider";

export const metadata: Metadata = {
  title: "YouGotIt — Corporate Training Simulator",
  description: "Transformez un document d'entreprise en simulation interactive avec évaluation des compétences.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
