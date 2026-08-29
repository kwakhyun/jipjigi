import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3108";
  return { rules: [{ userAgent: "*", allow: ["/", "/rental-management/"], disallow: ["/app/", "/api/", "/login"] }], sitemap: `${base}/sitemap.xml` };
}
