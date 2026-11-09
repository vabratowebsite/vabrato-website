import type { MetadataRoute } from "next";

// Block all crawlers until launch (S9). The live site is still WordPress.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
