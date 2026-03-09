import { promises as fs } from "node:fs";
import path from "node:path";

const ORIGIN = "https://drevis.sk";
const ROOT = process.cwd();
const SNAPSHOT_PAGES_DIR = path.join(ROOT, "_snapshot", "pages");
const MIRROR_PAGES_DIR = path.join(ROOT, "mirror", "pages");
const PUBLIC_DIR = path.join(ROOT, "public");

const ALLOWED_HOSTS = new Set(["drevis.sk", "www.drevis.sk"]);
const SITEMAP_START_POINTS = [
  `${ORIGIN}/sitemap.xml`,
  `${ORIGIN}/wp-sitemap.xml`,
  `${ORIGIN}/sitemap_index.xml`,
];

const ASSET_EXTENSIONS = new Set([
  ".avif",
  ".css",
  ".eot",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".js",
  ".json",
  ".map",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".svg",
  ".ttf",
  ".txt",
  ".webm",
  ".webp",
  ".woff",
  ".woff2",
  ".xml",
]);

function decodeHtmlEntities(value) {
  return value.replaceAll("&#038;", "&").replaceAll("&amp;", "&");
}

function cleanUrlToken(value) {
  return decodeHtmlEntities(value.trim().replace(/^['"]+|['"]+$/g, ""))
    .replace(/[),;]+$/g, "")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractLocUrlsFromXml(xml) {
  const urls = [];
  const locPattern = /<loc>([\s\S]*?)<\/loc>/gi;

  for (const match of xml.matchAll(locPattern)) {
    const url = decodeHtmlEntities(match[1].trim());
    if (url) {
      urls.push(url);
    }
  }

  return urls;
}

function normalizeToAbsoluteUrl(candidate, baseUrl) {
  const cleaned = cleanUrlToken(candidate);
  if (
    !cleaned ||
    cleaned.startsWith("#") ||
    cleaned.startsWith("data:") ||
    cleaned.startsWith("mailto:") ||
    cleaned.startsWith("tel:") ||
    cleaned.startsWith("javascript:")
  ) {
    return null;
  }

  const maybeProtocolRelative = cleaned.startsWith("//")
    ? `https:${cleaned}`
    : cleaned;
  const maybeRootRelative = maybeProtocolRelative.startsWith("/")
    ? `${ORIGIN}${maybeProtocolRelative}`
    : maybeProtocolRelative;

  try {
    const url = new URL(maybeRootRelative, baseUrl ?? ORIGIN);
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function isAllowedHost(urlString) {
  try {
    const url = new URL(urlString);
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function looksLikeSitemap(urlString) {
  try {
    const url = new URL(urlString);
    return /\.xml(\.gz)?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function looksLikePageUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!ALLOWED_HOSTS.has(url.hostname)) {
      return false;
    }

    const pathname = decodeURIComponent(url.pathname).toLowerCase();
    if (pathname.includes("/wp-content/") || pathname.includes("/wp-includes/")) {
      return false;
    }

    const extension = path.posix.extname(pathname);
    if (extension && ASSET_EXTENSIONS.has(extension)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

function extractCandidatesFromHtml(html) {
  const matches = new Set();

  const absoluteUrlPattern = /https?:\/\/[^"'`\s<>()\\]+/gi;
  for (const match of html.matchAll(absoluteUrlPattern)) {
    matches.add(match[0]);
  }

  const protocolRelativePattern = /\/\/(?:www\.)?drevis\.sk[^"'`\s<>()\\]+/gi;
  for (const match of html.matchAll(protocolRelativePattern)) {
    matches.add(`https:${match[0]}`);
  }

  const attrPattern = /(?:src|href)=['"]([^'"]+)['"]/gi;
  for (const match of html.matchAll(attrPattern)) {
    matches.add(match[1]);
  }

  const rootAssetPattern = /\/(?:wp-content|wp-includes|wp-admin|files|uploads|assets)\/[^"'`\s<>()\\]+/gi;
  for (const match of html.matchAll(rootAssetPattern)) {
    matches.add(match[0]);
  }

  return Array.from(matches);
}

function extractCandidatesFromCss(css) {
  const matches = new Set();

  const urlPattern = /url\(([^)]+)\)/gi;
  for (const match of css.matchAll(urlPattern)) {
    matches.add(match[1]);
  }

  const importPattern = /@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?/gi;
  for (const match of css.matchAll(importPattern)) {
    matches.add(match[1]);
  }

  return Array.from(matches);
}

function shouldDownloadAsset(absoluteUrl) {
  const url = new URL(absoluteUrl);
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    return false;
  }

  const pathname = decodeURIComponent(url.pathname);
  if (!pathname || pathname.endsWith("/")) {
    return false;
  }
  if (pathname.startsWith("/wp-json")) {
    return false;
  }
  if (pathname.endsWith(".php")) {
    return false;
  }

  const lowerPath = pathname.toLowerCase();
  const extension = path.posix.extname(lowerPath);

  if (ASSET_EXTENSIONS.has(extension)) {
    return true;
  }

  if (
    lowerPath.includes("/wp-content/") ||
    lowerPath.includes("/wp-includes/") ||
    lowerPath.includes("/uploads/") ||
    lowerPath.includes("/assets/")
  ) {
    return true;
  }

  return false;
}

function publicPathFromUrl(absoluteUrl) {
  const url = new URL(absoluteUrl);
  let decodedPathname;
  try {
    decodedPathname = decodeURIComponent(url.pathname);
  } catch {
    decodedPathname = url.pathname;
  }

  const relativePath = decodedPathname.replace(/^\/+/, "");
  if (!relativePath) {
    return null;
  }

  const destination = path.join(PUBLIC_DIR, relativePath);
  const rootWithSep = `${PUBLIC_DIR}${path.sep}`;
  if (!(destination === PUBLIC_DIR || destination.startsWith(rootWithSep))) {
    return null;
  }

  return destination;
}

function pageRouteFromUrl(urlString) {
  const url = new URL(urlString);
  const pathname = decodeURIComponent(url.pathname);
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function pageFilePathFromRoute(baseDir, routePath) {
  if (routePath === "/") {
    return path.join(baseDir, "index.html");
  }

  const noSlashes = routePath.replace(/^\/+|\/+$/g, "");
  return path.join(baseDir, `${noSlashes}.html`);
}

function rewritePageHtml(html) {
  const hosts = [
    "drevis.sk",
    "www.drevis.sk",
  ];

  let output = html;
  for (const host of hosts) {
    const plain = new RegExp(`https?:\\/\\/${escapeRegExp(host)}`, "gi");
    const escaped = new RegExp(`https?:\\\\/\\\\/${escapeRegExp(host)}`, "gi");
    output = output.replace(plain, "");
    output = output.replace(escaped, "\\/");
  }

  return output;
}

async function ensureDirForFile(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchTextOrNull(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CodexMirrorBot/1.0",
      },
    });

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

async function collectPageUrls() {
  const sitemapQueue = [...SITEMAP_START_POINTS];
  const visitedSitemaps = new Set();
  const pageUrls = new Set([`${ORIGIN}/`]);

  while (sitemapQueue.length > 0) {
    const sitemapUrl = sitemapQueue.shift();
    if (!sitemapUrl || visitedSitemaps.has(sitemapUrl)) {
      continue;
    }

    visitedSitemaps.add(sitemapUrl);
    const xml = await fetchTextOrNull(sitemapUrl);
    if (!xml) {
      continue;
    }

    const locUrls = extractLocUrlsFromXml(xml);
    for (const locUrl of locUrls) {
      if (!isAllowedHost(locUrl)) {
        continue;
      }

      if (looksLikeSitemap(locUrl)) {
        if (!visitedSitemaps.has(locUrl)) {
          sitemapQueue.push(locUrl);
        }
        continue;
      }

      if (looksLikePageUrl(locUrl)) {
        pageUrls.add(locUrl);
      }
    }
  }

  return Array.from(pageUrls).sort((a, b) => a.localeCompare(b));
}

async function downloadAsset(absoluteUrl) {
  const destination = publicPathFromUrl(absoluteUrl);
  if (!destination) {
    return null;
  }

  if (!(await fileExists(destination))) {
    await ensureDirForFile(destination);

    const response = await fetch(absoluteUrl, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CodexMirrorBot/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`Skip ${absoluteUrl} (${response.status})`);
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      console.warn(`Skip ${absoluteUrl} (html response)`);
      return null;
    }

    const data = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destination, data);
    console.log(`Downloaded ${absoluteUrl}`);
  }

  return destination;
}

async function main() {
  await fs.rm(SNAPSHOT_PAGES_DIR, { recursive: true, force: true });
  await fs.rm(MIRROR_PAGES_DIR, { recursive: true, force: true });

  await fs.mkdir(SNAPSHOT_PAGES_DIR, { recursive: true });
  await fs.mkdir(MIRROR_PAGES_DIR, { recursive: true });

  const pageUrls = await collectPageUrls();
  const assetQueue = [];
  const queuedAssets = new Set();

  for (const pageUrl of pageUrls) {
    const response = await fetch(pageUrl, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) CodexMirrorBot/1.0",
      },
    });

    if (!response.ok) {
      console.warn(`Skip page ${pageUrl} (${response.status})`);
      continue;
    }

    const html = await response.text();
    const routePath = pageRouteFromUrl(pageUrl);
    const snapshotPath = pageFilePathFromRoute(SNAPSHOT_PAGES_DIR, routePath);
    const mirrorPath = pageFilePathFromRoute(MIRROR_PAGES_DIR, routePath);

    await ensureDirForFile(snapshotPath);
    await ensureDirForFile(mirrorPath);
    await fs.writeFile(snapshotPath, html, "utf8");
    await fs.writeFile(mirrorPath, rewritePageHtml(html), "utf8");

    const baseUrl = new URL(routePath, ORIGIN).toString();
    for (const rawCandidate of extractCandidatesFromHtml(html)) {
      const absoluteUrl = normalizeToAbsoluteUrl(rawCandidate, baseUrl);
      if (!absoluteUrl || !shouldDownloadAsset(absoluteUrl) || queuedAssets.has(absoluteUrl)) {
        continue;
      }

      queuedAssets.add(absoluteUrl);
      assetQueue.push(absoluteUrl);
    }
  }

  const processedAssets = new Set();
  const availableAssets = new Set();

  for (let i = 0; i < assetQueue.length; i += 1) {
    const assetUrl = assetQueue[i];
    if (processedAssets.has(assetUrl)) {
      continue;
    }

    processedAssets.add(assetUrl);
    const localPath = await downloadAsset(assetUrl);
    if (!localPath) {
      continue;
    }
    availableAssets.add(localPath);

    if (!localPath.toLowerCase().endsWith(".css")) {
      continue;
    }

    const cssContent = await fs.readFile(localPath, "utf8");
    const rewrittenCss = rewritePageHtml(cssContent);
    if (rewrittenCss !== cssContent) {
      await fs.writeFile(localPath, rewrittenCss, "utf8");
    }

    for (const rawCandidate of extractCandidatesFromCss(rewrittenCss)) {
      const absoluteUrl = normalizeToAbsoluteUrl(rawCandidate, assetUrl);
      if (!absoluteUrl || !shouldDownloadAsset(absoluteUrl) || queuedAssets.has(absoluteUrl)) {
        continue;
      }

      queuedAssets.add(absoluteUrl);
      assetQueue.push(absoluteUrl);
    }
  }

  const mirroredPagesCount = (await fs.readdir(SNAPSHOT_PAGES_DIR, { recursive: true }))
    .filter((file) => String(file).endsWith(".html")).length;

  console.log(`Mirrored pages: ${mirroredPagesCount}`);
  console.log(`Downloaded assets: ${availableAssets.size}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
