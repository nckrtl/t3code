import { describe, expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  PreviewAutomationExecutionError,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { McpSchema, McpServer } from "effect/unstable/ai";

import * as CredentialAutofill from "../credentials/CredentialAutofill.ts";
import * as CredentialProvider from "../credentials/CredentialProvider.ts";
import * as ProcessRunner from "../processRunner.ts";
import * as McpHttpServer from "./McpHttpServer.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as PreviewAutomationBroker from "./PreviewAutomationBroker.ts";

const SECRET = "s3cret-Value!42";
const ITEM_ID = "abcdefghijklmnopqrstuvwxyz";
const VAULT_ID = "vaultvaultvaultvaultvault1";

const invocation = (capabilities: ReadonlyArray<McpInvocationContext.McpCapability>) => ({
  environmentId: EnvironmentId.make("environment-credentials-test"),
  threadId: ThreadId.make("thread-credentials-test"),
  providerSessionId: "provider-session-credentials-test",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(capabilities),
  issuedAt: 1,
});

const client = McpSchema.McpServerClient.of({
  clientId: 1,
  clientCapabilities: {},
  clientInfo: { name: "mcp-test", version: "1.0.0" },
  protocolVersion: "2025-06-18",
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "mcp-test", version: "1.0.0" },
  },
  getClient: Effect.die("unused"),
});

const toJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const itemList = toJson([
  {
    id: ITEM_ID,
    title: "GitHub",
    category: "LOGIN",
    vault: { id: VAULT_ID, name: "Private" },
    additional_information: "nick@example.com",
    urls: [{ label: "website", primary: true, href: "https://github.com/login" }],
  },
  {
    id: "zyxwvutsrqponmlkjihgfedcba",
    title: "GitLab",
    vault: { id: VAULT_ID, name: "Private" },
    urls: [{ href: "https://gitlab.com" }],
  },
]);

interface Scenario {
  readonly tabUrl?: string | null;
  readonly approved?: boolean;
  readonly fillFails?: boolean;
}

const makeHarness = (scenario: Scenario = {}) => {
  const opCalls: Array<ReadonlyArray<string>> = [];
  const brokerCalls: Array<{ operation: string; input: unknown; tabId?: string }> = [];
  const output = (stdout: string): ProcessRunner.ProcessRunOutput => ({
    stdout,
    stderr: "",
    code: 0 as ProcessRunner.ProcessRunOutput["code"],
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutInvalidUtf8: false,
    stderrInvalidUtf8: false,
  });
  const runner = Layer.mock(ProcessRunner.ProcessRunner)({
    run: (input) => {
      opCalls.push(input.args);
      return Effect.succeed(output(input.args[0] === "read" ? SECRET : itemList));
    },
  });
  const broker = Layer.mock(PreviewAutomationBroker.PreviewAutomationBroker)({
    invoke: <A>(request: PreviewAutomationBroker.PreviewAutomationInvokeInput) => {
      brokerCalls.push({
        operation: request.operation,
        input: request.input,
        ...(request.tabId === undefined ? {} : { tabId: request.tabId }),
      });
      switch (request.operation) {
        case "status": {
          const url = scenario.tabUrl === undefined ? "https://github.com/login" : scenario.tabUrl;
          return Effect.succeed({
            available: url !== null,
            visible: true,
            tabId: "tab-1",
            url,
            title: "Sign in",
            loading: false,
          } as A);
        }
        case "credentialApproval":
          return Effect.succeed({ approved: scenario.approved ?? true } as A);
        case "credentialFill":
          return scenario.fillFails
            ? Effect.fail(
                new PreviewAutomationExecutionError({
                  operation: "credentialFill",
                  environmentId: request.scope.environmentId,
                  threadId: request.scope.threadId,
                  providerSessionId: request.scope.providerSessionId,
                  providerInstanceId: request.scope.providerInstanceId,
                  clientId: "client",
                  connectionId: "connection",
                  requestId: "preview-1",
                  timeoutMs: 15_000,
                  remoteTag: "PreviewAutomationExecutionError",
                  remoteMessageLength: 0,
                  cause: null,
                }),
              )
            : Effect.succeed({ status: "filled" } as A);
        default:
          return Effect.die(`unexpected operation ${request.operation}`);
      }
    },
  });
  const layer = McpHttpServer.CredentialsToolkitRegistrationLive.pipe(
    Layer.provideMerge(McpServer.McpServer.layer),
    Layer.provide(CredentialAutofill.layer),
    Layer.provide(CredentialProvider.layerOnePassword),
    Layer.provide(runner),
    Layer.provide(broker),
  );
  const call = (name: string, args: Record<string, unknown>, capabilities = ["preview"] as const) =>
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      return yield* server
        .callTool({ name, arguments: args })
        .pipe(
          Effect.provideService(
            McpInvocationContext.McpInvocationContext,
            invocation(capabilities),
          ),
          Effect.provideService(McpSchema.McpServerClient, client),
        );
    });
  return { opCalls, brokerCalls, layer, call };
};

const secretReads = (opCalls: ReadonlyArray<ReadonlyArray<string>>) =>
  opCalls.filter((args) => args[0] === "read" || args.includes("--otp"));

describe("credentials MCP tools", () => {
  it.effect("lists matching logins as metadata without revealing fields", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      expect(server.tools.map(({ tool }) => tool.name).toSorted()).toEqual([
        "fill_credential",
        "request_credentials",
      ]);
      const result = yield* harness.call("request_credentials", { domain: "github.com" });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toEqual({
        items: [{ id: ITEM_ID, title: "GitHub", urls: ["https://github.com/login"] }],
      });
      // The username hint 1Password lists is not passed on.
      expect(toJson(result)).not.toContain("nick@example.com");
      expect(harness.opCalls).toEqual([
        ["item", "list", "--categories", "Login", "--format", "json"],
      ]);
      expect(harness.opCalls.flat()).not.toContain("--reveal");
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });

  it.effect("fills after approval and returns only a status", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const result = yield* harness.call("fill_credential", {
        itemId: ITEM_ID,
        field: "password",
      });
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({ status: "filled" });
      expect(toJson(result)).not.toContain(SECRET);

      expect(harness.brokerCalls.map((entry) => entry.operation)).toEqual([
        "status",
        "credentialApproval",
        "credentialFill",
      ]);
      const [, approval, fill] = harness.brokerCalls;
      // The prompt names the item and origin, and holds no secret.
      expect(approval!.input).toEqual({
        itemTitle: "GitHub",
        providerLabel: "1Password",
        origin: "https://github.com",
        field: "password",
      });
      expect(approval!.tabId).toBe("tab-1");
      // The secret only travels in the fill request, pinned to the checked tab and origin.
      expect(fill!.tabId).toBe("tab-1");
      expect(fill!.input).toMatchObject({
        field: "password",
        expectedOrigin: "https://github.com",
        value: SECRET,
      });
      expect(harness.opCalls).toContainEqual([
        "read",
        "--no-newline",
        `op://${VAULT_ID}/${ITEM_ID}/password`,
      ]);
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });

  it.effect("reads no secret when the user denies", () => {
    const harness = makeHarness({ approved: false });
    return Effect.gen(function* () {
      const result = yield* harness.call("fill_credential", { itemId: ITEM_ID, field: "password" });
      expect(result.structuredContent).toMatchObject({ status: "denied" });
      expect(secretReads(harness.opCalls)).toEqual([]);
      expect(harness.brokerCalls.map((entry) => entry.operation)).not.toContain("credentialFill");
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });

  it.effect("refuses another origin without asking the user or reading a secret", () => {
    const harness = makeHarness({ tabUrl: "https://github.com.evil.example/login" });
    return Effect.gen(function* () {
      const result = yield* harness.call("fill_credential", { itemId: ITEM_ID, field: "password" });
      expect(result.structuredContent).toMatchObject({ status: "origin_mismatch" });
      expect(harness.brokerCalls.map((entry) => entry.operation)).toEqual(["status"]);
      expect(secretReads(harness.opCalls)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });

  it.effect("reports a tab without a page", () => {
    const harness = makeHarness({ tabUrl: null });
    return Effect.gen(function* () {
      const result = yield* harness.call("fill_credential", { itemId: ITEM_ID, field: "username" });
      expect(result.structuredContent).toMatchObject({ status: "tab_unavailable" });
      expect(secretReads(harness.opCalls)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });

  it.effect("reads one-time codes through --otp", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const result = yield* harness.call("fill_credential", { itemId: ITEM_ID, field: "otp" });
      expect(result.structuredContent).toMatchObject({ status: "filled" });
      expect(harness.opCalls).toContainEqual([
        "item",
        "get",
        ITEM_ID,
        "--vault",
        VAULT_ID,
        "--otp",
      ]);
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });

  it.effect("keeps the secret out of a failed fill's error", () => {
    const harness = makeHarness({ fillFails: true });
    return Effect.gen(function* () {
      const result = yield* harness.call("fill_credential", { itemId: ITEM_ID, field: "password" });
      expect(result.isError).toBe(true);
      expect(toJson(result)).not.toContain(SECRET);
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });

  it.effect("rejects unknown items and missing browser access", () => {
    const harness = makeHarness();
    return Effect.gen(function* () {
      const unknown = yield* harness.call("fill_credential", {
        itemId: "zzzzzzzzzzzzzzzzzzzzzzzzzz",
        field: "password",
      });
      expect(unknown.structuredContent).toMatchObject({ status: "item_not_found" });
      const denied = yield* harness.call(
        "fill_credential",
        { itemId: ITEM_ID, field: "password" },
        [] as never,
      );
      expect(denied.isError).toBe(true);
      expect(secretReads(harness.opCalls)).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(harness.layer));
  });
});
