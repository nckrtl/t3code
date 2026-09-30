// rooms-patches: fork builds are versioned "<upstream version>-rooms.<date>[.<n>]".
// Upstream publishes release assets only under its own versions.

/** The upstream release a rooms-patches build is based on; other versions pass through. */
export function upstreamReleaseVersion(appVersion: string): string {
  return appVersion.replace(/-rooms\.\d+(\.\d+)*$/u, "");
}
