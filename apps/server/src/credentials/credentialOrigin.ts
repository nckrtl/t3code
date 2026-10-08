/**
 * Which saved login URLs may be filled into which browser origins.
 *
 * The rule is deliberately strict: same host (ignoring a leading `www.`),
 * same port, and https unless the saved URL itself says http. A saved URL
 * without a scheme means https, except for loopback and `.localhost`/`.test`
 * development hosts, which may also use http. Subdomains do not match; save
 * the exact sign-in host in the password manager instead.
 */

const DEVELOPMENT_HOST = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$|\.(localhost|test)$/i;

const stripWww = (host: string) => host.replace(/^www\./i, "");

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

interface SavedTarget {
  readonly host: string;
  readonly port: string;
  readonly schemes: ReadonlySet<string>;
}

const defaultPort = (scheme: string) => (scheme === "http:" ? "80" : "443");

/** Parses one saved login URL into the hosts and schemes it may fill. */
export function parseSavedUrl(saved: string): SavedTarget | null {
  const trimmed = saved.trim();
  if (trimmed.length === 0) return null;
  const explicit = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const url = parseUrl(explicit ? trimmed : `https://${trimmed}`);
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:") || !url.hostname) {
    return null;
  }
  const host = stripWww(url.hostname.toLowerCase());
  const schemes = new Set([url.protocol]);
  if (!explicit && DEVELOPMENT_HOST.test(url.hostname)) schemes.add("http:");
  return { host, port: url.port, schemes };
}

/**
 * The tab's origin when one of the saved URLs matches it, otherwise null.
 * The returned origin is what the desktop re-checks right before filling.
 */
export function matchingOrigin(savedUrls: ReadonlyArray<string>, tabUrl: string): string | null {
  const tab = parseUrl(tabUrl);
  if (!tab || (tab.protocol !== "https:" && tab.protocol !== "http:")) return null;
  const tabHost = stripWww(tab.hostname.toLowerCase());
  const tabPort = tab.port || defaultPort(tab.protocol);
  for (const saved of savedUrls) {
    const target = parseSavedUrl(saved);
    if (!target || target.host !== tabHost || !target.schemes.has(tab.protocol)) continue;
    // An unstated saved port means the scheme default for the tab's scheme.
    if ((target.port || defaultPort(tab.protocol)) !== tabPort) continue;
    return tab.origin;
  }
  return null;
}

/** The host an agent asked for: a bare host or the host of a full URL. */
export function requestedHost(domain: string): string | null {
  return parseSavedUrl(domain)?.host ?? null;
}

/**
 * Whether a saved item belongs to the requested host. Looser than
 * `matchingOrigin` so a request for `github.com` also lists an item saved
 * for `https://github.com/login`; filling still requires an exact origin.
 */
export function savedUrlsMatchHost(savedUrls: ReadonlyArray<string>, host: string): boolean {
  return savedUrls.some((saved) => parseSavedUrl(saved)?.host === host);
}
