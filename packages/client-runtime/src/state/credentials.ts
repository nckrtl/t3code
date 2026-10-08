import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand, createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createCredentialsEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    /** Whether the environment's password manager CLI is installed and set up. */
    status: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:credentials:status",
      tag: WS_METHODS.credentialsStatus,
    }),
    /** Saved logins for one page origin, for the browser's key menu. */
    listForSite: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:credentials:list-for-site",
      tag: WS_METHODS.credentialsListForSite,
    }),
    /** Fills a login the user picked in the browser's key menu. */
    fillForSite: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:credentials:fill-for-site",
      tag: WS_METHODS.credentialsFillForSite,
    }),
  };
}
