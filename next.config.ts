import type { NextConfig } from "next";

const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  env: {
    // The client also needs this value for images stored in public/skin.
    NEXT_PUBLIC_SITE_BASE_PATH: basePath,
    NEXT_PUBLIC_SITE_URL: basePath ? "https://xott69.github.io" : "https://monoskin.pages.dev",
  },
  images: { unoptimized: true },
};

export default nextConfig;
