const siteBasePath = process.env.NEXT_PUBLIC_SITE_BASE_PATH ?? "";

/** Builds a public asset/link path for both GitHub Pages and a root domain. */
export function sitePath(path = "/") {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${siteBasePath}${normalizedPath}`;
}
