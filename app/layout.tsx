import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MONOSKIN — каталог скінів карток",
  description:
    "Внутрішній каталог скінів карток для операторів: умови, доступність і інструкції.",
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body>{children}</body>
    </html>
  );
}
