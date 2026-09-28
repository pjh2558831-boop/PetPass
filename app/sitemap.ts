import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://weekendog.site/", changeFrequency: "weekly", priority: 1 },
  ];
}
