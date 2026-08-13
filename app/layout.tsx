import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { sitePath } from "@/lib/site-path";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://xott69.github.io";
const cloudflareAnalyticsToken = process.env.NEXT_PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "MONOSKIN — каталог скінів карток mono",
  description:
    "Відкритий каталог скінів карток mono: доступність, умови отримання та посилання.",
  openGraph: {
    title: "MONOSKIN — усі скіни карток mono",
    description: "Відкритий каталог скінів карток: умови отримання та доступність.",
    url: "/",
    siteName: "MONOSKIN",
    locale: "uk_UA",
    type: "website",
    images: [{ url: sitePath("og.png"), width: 1680, height: 944, alt: "MONOSKIN — усі скіни карток mono" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MONOSKIN — усі скіни карток mono",
    description: "Відкритий каталог скінів карток: умови отримання та доступність.",
    images: [sitePath("og.png")],
  },
  icons: {
    icon: "monoskin-avatar.png",
    shortcut: "monoskin-avatar.png",
    apple: "monoskin-avatar.png",
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
      <body>
        <a className="skip-link" href="#catalog">Перейти до каталогу</a>
        {children}
        {cloudflareAnalyticsToken && <Script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={JSON.stringify({ token: cloudflareAnalyticsToken })}
          strategy="afterInteractive"
        />}
      </body>
    </html>
  );
}
