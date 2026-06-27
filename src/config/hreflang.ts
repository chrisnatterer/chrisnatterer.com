// Central hreflang / translation-group registry.
// Pattern from globalization-guide-astro/docs/hreflang-central-registry.md.
//
// Define each translation group ONCE. `getAlternates(pathname)` returns the
// complete, identical alternate set (every language in the group + self +
// x-default, all trailing-slash absolute URLs) for any page in a group, or
// `undefined` for pages that are not structural. Those (individual articles)
// keep the per-page alternates BaseLayout builds from their `altUrl` frontmatter.

export type Lang = "en" | "de";

interface Group {
  members: Partial<Record<Lang, string>>;
  xDefault?: Lang;
}

// One object per set of equivalent pages. This array is the whole maintenance
// surface for structural pages. Articles are handled per-frontmatter, not here.
const GROUPS: Group[] = [
  { members: { en: "/", de: "/de/" } },
  { members: { en: "/artikel/", de: "/de/artikel/" } },
];

export const SITE_URL = "https://chrisnatterer.com";

// Normalize a pathname to the "/path/" form used as group keys + hrefs.
export function normalize(pathname: string): string {
  if (!pathname) return "/";
  let p = pathname;
  if (!p.startsWith("/")) p = `/${p}`;
  if (!p.endsWith("/")) p = `${p}/`;
  return p;
}

export function abs(path: string, siteUrl = SITE_URL): string {
  return `${siteUrl}${normalize(path)}`;
}

// Build the lookup once: normalized path -> its group.
const PATH_INDEX = new Map<string, Group>();
for (const group of GROUPS) {
  for (const path of Object.values(group.members)) {
    PATH_INDEX.set(normalize(path), group);
  }
}

/**
 * Complete hreflang set for a page, or `undefined` if it is not in a group.
 * Identical for every member of a group: all languages (self included) plus
 * x-default, every href an absolute trailing-slash URL.
 */
export function getAlternates(
  pathname: string,
  siteUrl = SITE_URL,
): Array<{ hreflang: string; href: string }> | undefined {
  const group = PATH_INDEX.get(normalize(pathname));
  if (!group) return undefined;

  const alternates = (Object.entries(group.members) as Array<[Lang, string]>).map(
    ([hreflang, path]) => ({ hreflang, href: abs(path, siteUrl) }),
  );

  const xDefaultLang = group.xDefault ?? "en";
  const xDefaultPath = group.members[xDefaultLang] ?? Object.values(group.members)[0]!;
  alternates.push({ hreflang: "x-default", href: abs(xDefaultPath, siteUrl) });

  return alternates;
}
