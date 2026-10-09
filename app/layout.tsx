import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FertiliTrace | Operações de fertilizantes",
  description:
    "Controle a movimentação e a rastreabilidade de fertilizantes do navio ao caminhão.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
