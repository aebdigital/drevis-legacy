import { readFile } from "node:fs/promises";
import path from "node:path";

const MIRROR_PAGES_DIR = path.join(process.cwd(), "mirror", "pages");

function normalizeParts(parts: string[]): string[] | null {
  const normalized: string[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      return null;
    }

    const decoded = decodeURIComponent(trimmed);
    if (decoded.includes("/") || decoded.includes("\\") || decoded === "." || decoded === "..") {
      return null;
    }

    normalized.push(decoded);
  }

  return normalized;
}

function filePathFromParts(parts: string[]): string | null {
  const normalized = normalizeParts(parts);
  if (!normalized) {
    return null;
  }

  const relative = normalized.length === 0 ? "index.html" : `${normalized.join("/")}.html`;
  const absolute = path.join(MIRROR_PAGES_DIR, relative);
  const rootWithSeparator = `${MIRROR_PAGES_DIR}${path.sep}`;

  if (absolute !== MIRROR_PAGES_DIR && !absolute.startsWith(rootWithSeparator)) {
    return null;
  }

  return absolute;
}

export async function getMirrorPage(parts: string[]): Promise<string | null> {
  const filePath = filePathFromParts(parts);
  if (!filePath) {
    return null;
  }

  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}
