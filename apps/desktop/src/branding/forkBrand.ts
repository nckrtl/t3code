import { resolveAppBrand, type AppBrand, type AppBrandSource } from "./appBrand.ts";
import forkBrandFile from "./forkBrand.json" with { type: "json" };

/**
 * The nckrtl fork's identity. Build and launcher scripts resolve the brand from
 * this file plus the environment; the desktop bundle gets the result baked in.
 * To build the stock T3 Code app, delete the fields in `forkBrand.json`.
 */
export const FORK_BRAND_SOURCE: AppBrandSource = forkBrandFile as AppBrandSource;

export function resolveForkBrand(env: Readonly<Record<string, string | undefined>>): AppBrand {
  return resolveAppBrand(FORK_BRAND_SOURCE, env);
}
