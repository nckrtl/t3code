import * as Effect from "effect/Effect";

import * as CredentialAutofill from "../../../credentials/CredentialAutofill.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { CredentialsToolkit } from "./tools.ts";

// Credentials drive the collaborative browser, so they share its capability.
export const CredentialsToolkitHandlersLive = CredentialsToolkit.toLayer({
  request_credentials: (input) =>
    Effect.gen(function* () {
      yield* McpInvocationContext.requireMcpCapability("preview");
      const autofill = yield* CredentialAutofill.CredentialAutofill;
      return yield* autofill.request(input);
    }),
  save_test_login: (input) =>
    Effect.gen(function* () {
      yield* McpInvocationContext.requireMcpCapability("preview");
      const autofill = yield* CredentialAutofill.CredentialAutofill;
      return yield* autofill.saveTestLogin(input);
    }),
  fill_credential: (input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.requireMcpCapability("preview");
      const autofill = yield* CredentialAutofill.CredentialAutofill;
      return yield* autofill.fill(scope, input);
    }),
});
