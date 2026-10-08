import { createCredentialsEnvironmentAtoms } from "@t3tools/client-runtime/state/credentials";

import { connectionAtomRuntime } from "../connection/runtime";

export const credentialsEnvironment = createCredentialsEnvironmentAtoms(connectionAtomRuntime);
