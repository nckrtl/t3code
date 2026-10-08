import { WS_METHODS } from "@t3tools/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcQueryAtomFamily } from "./runtime.ts";

export function createCredentialsEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    /** Whether the environment's password manager CLI is installed and set up. */
    status: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:credentials:status",
      tag: WS_METHODS.credentialsStatus,
    }),
  };
}
