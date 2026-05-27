import catppuccinIcons from "@iconify-json/catppuccin/icons.json";
import materialIcons from "@iconify-json/material-icon-theme/icons.json";
import vscodeIcons from "@iconify-json/vscode-icons/icons.json";
import type { IconThemeId } from "@/modules/settings/store";
import { EXT_TO_LANGUAGE_ID } from "./constants";
import * as fileIconsMod from "./fileIcons";
import * as folderIconsMod from "./folderIcons";

const catFileNames = fileIconsMod.fileNames as Record<string, string>;
const catFileExtensions = fileIconsMod.fileExtensions as Record<string, string>;
const catLanguageIds = fileIconsMod.languageIds as Record<string, string>;
const catFolderNames = folderIconsMod.folderNames as Record<string, string>;

type IconifySet = {
  icons: Record<string, { body: string }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
};

const SETS: Record<IconThemeId, IconifySet> = {
  catppuccin: catppuccinIcons as unknown as IconifySet,
  material: materialIcons as unknown as IconifySet,
  vscode: vscodeIcons as unknown as IconifySet,
};

const DEFAULT_FILE = "file";
const DEFAULT_FOLDER = "folder";
const DEFAULT_FOLDER_OPEN = "folder-open";

const dataUrlCacheByTheme = new Map<IconThemeId, Map<string, string>>();

function getCache(theme: IconThemeId): Map<string, string> {
  let m = dataUrlCacheByTheme.get(theme);
  if (!m) {
    m = new Map<string, string>();
    dataUrlCacheByTheme.set(theme, m);
  }
  return m;
}

// Catppuccin's manifest emits names like `folder_src`/`typescript-react`, but
// the iconify export normalizes everything to hyphenated slugs. Material Icon
// Theme follows the same convention so we share the slug pipeline.
function toIconifySlug(name: string): string {
  return name.replace(/_/g, "-");
}

// VSCode Icons uses a different naming convention: `default_file`,
// `default_folder`, `default_folder_opened`, `file_type_<name>`,
// `folder_type_<name>` (+ `_opened` variant). Best-effort translation; missing
// slugs fall back to default file/folder.
function vscodeSlug(name: string): string {
  if (name === DEFAULT_FILE) return "default_file";
  if (name === DEFAULT_FOLDER) return "default_folder";
  if (name === DEFAULT_FOLDER_OPEN) return "default_folder_opened";
  if (name.startsWith("folder-")) {
    const isOpen = name.endsWith("-open");
    const inner = isOpen ? name.slice(7, -5) : name.slice(7);
    const folderName = inner.replace(/-/g, "");
    return isOpen ? `folder_type_${folderName}_opened` : `folder_type_${folderName}`;
  }
  return `file_type_${name.replace(/-/g, "")}`;
}

function slugForTheme(theme: IconThemeId, name: string): string {
  return theme === "vscode" ? vscodeSlug(name) : toIconifySlug(name);
}

function bodyFromSet(set: IconifySet, slug: string): string | null {
  const direct = set.icons[slug];
  if (direct) return direct.body;
  const alias = set.aliases?.[slug];
  if (alias) {
    const parent = set.icons[alias.parent];
    if (parent) return parent.body;
  }
  return null;
}

function buildDataUrl(theme: IconThemeId, name: string): string | null {
  const cache = getCache(theme);
  const cached = cache.get(name);
  if (cached !== undefined) return cached || null;

  const set = SETS[theme];
  const slug = slugForTheme(theme, name);
  let body = bodyFromSet(set, slug);

  // If a specific icon is missing in this theme, fall back to default file or
  // folder slug instead of returning empty.
  if (!body && name !== DEFAULT_FILE && name !== DEFAULT_FOLDER && name !== DEFAULT_FOLDER_OPEN) {
    const fallback = name === DEFAULT_FOLDER_OPEN
      ? slugForTheme(theme, DEFAULT_FOLDER_OPEN)
      : name.startsWith("folder-") || name.endsWith("-open")
        ? slugForTheme(theme, DEFAULT_FOLDER)
        : slugForTheme(theme, DEFAULT_FILE);
    body = bodyFromSet(set, fallback);
  }

  if (!body) {
    cache.set(name, "");
    return null;
  }

  const w = set.width ?? 16;
  const h = set.height ?? 16;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  cache.set(name, url);
  return url;
}

function extOf(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.indexOf(".");
  if (dot === -1 || dot === lower.length - 1) return "";
  return lower.slice(dot + 1);
}

export function fileIconUrl(name: string, theme: IconThemeId = "catppuccin"): string {
  const lower = name.toLowerCase();

  const byName = catFileNames[lower];
  if (byName) {
    const url = buildDataUrl(theme, byName);
    if (url) return url;
  }

  let ext = extOf(lower);
  while (ext) {
    const iconName = catFileExtensions[ext];
    if (iconName) {
      const url = buildDataUrl(theme, iconName);
      if (url) return url;
    }
    const langId = EXT_TO_LANGUAGE_ID[ext];
    if (langId) {
      const iconByLang = catLanguageIds[langId];
      if (iconByLang) {
        const url = buildDataUrl(theme, iconByLang);
        if (url) return url;
      }
    }
    const nextDot = ext.indexOf(".");
    if (nextDot === -1) break;
    ext = ext.slice(nextDot + 1);
  }

  return buildDataUrl(theme, DEFAULT_FILE) ?? "";
}

export function folderIconUrl(
  name: string,
  expanded: boolean,
  theme: IconThemeId = "catppuccin",
): string {
  const lower = name.toLowerCase();

  const mapped = catFolderNames[lower];
  if (mapped) {
    const slug = toIconifySlug(mapped);
    const target = expanded ? `${slug}-open` : slug;
    const url = buildDataUrl(theme, target);
    if (url) return url;
  }

  return buildDataUrl(theme, expanded ? DEFAULT_FOLDER_OPEN : DEFAULT_FOLDER) ?? "";
}
