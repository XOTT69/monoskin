import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://xott69.github.io"),
  title: "MONOSKIN — каталог скінів карток mono",
  description:
    "Відкритий каталог скінів карток mono: доступність, умови отримання та посилання.",
  openGraph: {
    title: "MONOSKIN — усі скіни карток mono",
    description: "Відкритий каталог скінів карток: умови отримання та доступність.",
    url: "/monoskin/",
    siteName: "MONOSKIN",
    locale: "uk_UA",
    type: "website",
    images: [{ url: "/monoskin/og.png", width: 1680, height: 944, alt: "MONOSKIN — усі скіни карток mono" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MONOSKIN — усі скіни карток mono",
    description: "Відкритий каталог скінів карток: умови отримання та доступність.",
    images: ["/monoskin/og.png"],
  },
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090909",
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
