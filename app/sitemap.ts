import { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://rp2p.com";
  const currentDate = new Date();

  // Core etymology entries for SEO spider crawling and search ranking
  const etymologyWords = [
    "inspiration",
    "reflection",
    "anonymity",
    "reciprocity",
    "mindfulness",
    "serenity",
    "gratitude"
  ];

  const etymologyEntries = etymologyWords.map((word) => ({
    url: `${baseUrl}/etymology/${word}`,
    lastModified: currentDate,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  const staticEntries = [
    // Primary Canonical Landing Page (Max priority)
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: "daily" as const,
      priority: 1.0,
    },
    // Potential Future Dynamic or Static Archive Pages
    {
      url: `${baseUrl}/archive`,
      lastModified: currentDate,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/guidelines`,
      lastModified: currentDate,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    },
    // Potential Peer-to-Peer Message Detail or Showcase Routes
    {
      url: `${baseUrl}/message/system-starter-seo`,
      lastModified: currentDate,
      changeFrequency: "never" as const,
      priority: 0.2,
    },
  ];

  return [...staticEntries, ...etymologyEntries];
}
