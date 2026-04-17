import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");

function normalizeSiteUrl(value) {
  if (!value) {
    return "";
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.replace(/\/+$/, "");
  }

  return `https://${value}`.replace(/\/+$/, "");
}

const fallbackVercelUrl =
  process.env.VERCEL_PROJECT_PRODUCTION_URL ||
  process.env.VERCEL_URL;

const siteUrl = normalizeSiteUrl(
  process.env.SITE_URL || process.env.VITE_SITE_URL || fallbackVercelUrl,
);

const pages = [
  { path: "/", file: "index.html" },
  { path: "/privacy.html", file: "privacy.html" },
  { path: "/terms.html", file: "terms.html" },
];

async function injectCanonical(htmlFile, canonicalUrl) {
  const filePath = path.join(distDir, htmlFile);
  const content = await readFile(filePath, "utf8");

  if (content.includes('rel="canonical"')) {
    return;
  }

  const updated = content.replace(
    "</head>",
    `  <link rel="canonical" href="${canonicalUrl}" />\n  </head>`,
  );

  await writeFile(filePath, updated, "utf8");
}

async function main() {
  await mkdir(distDir, { recursive: true });

  const robots = siteUrl
    ? `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`
    : "User-agent: *\nAllow: /\n";

  await writeFile(path.join(distDir, "robots.txt"), robots, "utf8");

  if (!siteUrl) {
    console.warn(
      "[postbuild-seo] No SITE_URL set. Skipping canonical and sitemap generation.",
    );
    return;
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (page) => `  <url>
    <loc>${siteUrl}${page.path}</loc>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  await writeFile(path.join(distDir, "sitemap.xml"), sitemap, "utf8");

  await Promise.all(
    pages.map((page) => injectCanonical(page.file, `${siteUrl}${page.path}`)),
  );
}

main().catch((error) => {
  console.error("[postbuild-seo] Failed:", error);
  process.exitCode = 1;
});
