/**
 * The address a server gets as a sign-in return link.
 *
 * The T3 server accepts only upstream's desktop schemes (`t3code://`,
 * `t3code-dev://`) in a return link, and we do not change the server. A renamed
 * desktop app (`conn://app/...`) therefore sends the upstream form of its own
 * address. It still handles links in that scheme and moves them back to its own.
 */
export function serverReturnHref(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return href;
  }
  if (url.protocol === "http:" || url.protocol === "https:" || url.host !== "app") return href;
  const scheme = url.protocol.slice(0, -1);
  if (scheme === "t3code" || scheme === "t3code-dev") return href;
  const upstream = scheme.endsWith("-dev") ? "t3code-dev" : "t3code";
  return `${upstream}://app${url.pathname}${url.search}${url.hash}`;
}
