import type { CredentialField, CredentialProviderStatus } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as ProcessRunner from "../processRunner.ts";

/** Metadata of one saved login. Never holds a secret. */
export interface CredentialLogin {
  readonly id: string;
  readonly title: string;
  readonly vaultId: string;
  readonly urls: ReadonlyArray<string>;
  /** 1Password's username hint. Shown to the user only, never to agents. */
  readonly username: string | null;
}

/**
 * The password manager could not answer. The message is fixed per reason:
 * CLI output never reaches it, so a secret cannot either.
 */
export class CredentialProviderUnavailableError extends Schema.TaggedError<CredentialProviderUnavailableError>()(
  "CredentialProviderUnavailableError",
  {
    provider: Schema.String,
    reason: Schema.Literals(["not_installed", "failed", "timed_out", "malformed_output"]),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "not_installed":
        return `The ${this.provider} CLI is not installed on the T3 Code server.`;
      case "timed_out":
        return `${this.provider} did not answer in time. The user may need to unlock it.`;
      case "malformed_output":
        return `${this.provider} returned output T3 Code could not read.`;
      case "failed":
        return `${this.provider} could not complete the request. The user may need to sign in to or unlock it.`;
    }
  }
}

/**
 * A password manager reachable from the server. Listing returns metadata
 * only; `readSecret` is the one path to a secret value and is called only
 * after the user approved a fill. Bitwarden (`bw`) fits the same shape.
 */
export class CredentialProvider extends Context.Service<
  CredentialProvider,
  {
    readonly label: string;
    /** Whether the CLI is installed and has an account. Never unlocks a vault. */
    readonly status: Effect.Effect<CredentialProviderStatus>;
    readonly listLogins: Effect.Effect<
      ReadonlyArray<CredentialLogin>,
      CredentialProviderUnavailableError
    >;
    /** None when the login has no value for this field. */
    readonly readSecret: (
      login: CredentialLogin,
      field: CredentialField,
    ) => Effect.Effect<
      Option.Option<Redacted.Redacted<string>>,
      CredentialProviderUnavailableError
    >;
  }
>()("t3/credentials/CredentialProvider") {}

const OnePasswordItem = Schema.Struct({
  id: Schema.String,
  title: Schema.optional(Schema.String),
  vault: Schema.Struct({ id: Schema.String }),
  additional_information: Schema.optional(Schema.String),
  urls: Schema.optional(Schema.Array(Schema.Struct({ href: Schema.String }))),
});
const decodeOnePasswordItems = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(OnePasswordItem)),
);

const decodeAccountList = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.Unknown)),
);

const OP_ID = /^[a-z0-9]+$/i;
const LIST_CACHE_MS = 30_000;
const OP_TIMEOUT = "90 seconds";
/** `op` stderr when the item has no such field or no one-time password. */
const MISSING_VALUE = /isn't a field|could not find|does not have|no one-time password|no otp/i;

/** Parses `op item list --format json`. */
function parseOnePasswordItemList(stdout: string): ReadonlyArray<CredentialLogin> | null {
  return Option.match(decodeOnePasswordItems(stdout), {
    onNone: () => null,
    onSome: (items) =>
      items
        .filter((item) => OP_ID.test(item.id) && OP_ID.test(item.vault.id))
        .map((item) => ({
          id: item.id,
          title: item.title ?? "",
          vaultId: item.vault.id,
          urls: (item.urls ?? []).map((url) => url.href),
          username: item.additional_information?.trim() || null,
        })),
  });
}

/** The `op` arguments that read one field. */
function onePasswordReadArgs(
  login: CredentialLogin,
  field: CredentialField,
): ReadonlyArray<string> {
  return field === "otp"
    ? ["item", "get", login.id, "--vault", login.vaultId, "--otp"]
    : ["read", "--no-newline", `op://${login.vaultId}/${login.id}/${field}`];
}

const makeOnePassword = Effect.gen(function* () {
  const runner = yield* ProcessRunner.ProcessRunner;
  const cache = yield* Ref.make<{
    readonly at: number;
    readonly logins: ReadonlyArray<CredentialLogin>;
  } | null>(null);
  const unavailable = (reason: CredentialProviderUnavailableError["reason"]) =>
    new CredentialProviderUnavailableError({ provider: "1Password", reason });
  const runOp = (args: ReadonlyArray<string>) =>
    runner
      .run({ command: "op", args, timeout: OP_TIMEOUT, timeoutBehavior: "timedOutResult" })
      .pipe(
        Effect.mapError((error) =>
          unavailable(error._tag === "ProcessSpawnError" ? "not_installed" : "failed"),
        ),
        Effect.filterOrFail(
          (output) => !output.timedOut,
          () => unavailable("timed_out"),
        ),
      );

  const listLogins = Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const cached = yield* Ref.get(cache);
    if (cached && now - cached.at < LIST_CACHE_MS) return cached.logins;
    // Metadata only: no --reveal, and `item list` never prints field values.
    const output = yield* runOp(["item", "list", "--categories", "Login", "--format", "json"]);
    if (output.code !== 0) return yield* unavailable("failed");
    const logins = parseOnePasswordItemList(output.stdout);
    if (!logins) return yield* unavailable("malformed_output");
    yield* Ref.set(cache, { at: now, logins });
    return logins;
  }).pipe(Effect.withSpan("CredentialProvider.onePassword.listLogins"));

  const readSecret = (login: CredentialLogin, field: CredentialField) =>
    Effect.gen(function* () {
      if (!OP_ID.test(login.id) || !OP_ID.test(login.vaultId)) {
        return yield* unavailable("malformed_output");
      }
      const output = yield* runOp(onePasswordReadArgs(login, field));
      if (output.code !== 0) {
        return MISSING_VALUE.test(output.stderr) ? Option.none() : yield* unavailable("failed");
      }
      const value = field === "otp" ? output.stdout.trim() : output.stdout;
      return value.length === 0 ? Option.none() : Option.some(Redacted.make(value));
    }).pipe(Effect.withSpan("CredentialProvider.onePassword.readSecret"));

  const status = Effect.gen(function* () {
    const result = (
      state: CredentialProviderStatus["state"],
      version: string | null = null,
    ): CredentialProviderStatus => ({ provider: "1password", label: "1Password", state, version });
    const versionRun = yield* runner
      .run({ command: "op", args: ["--version"], timeout: "10 seconds" })
      .pipe(Effect.result);
    if (versionRun._tag === "Failure") {
      return result(
        versionRun.failure._tag === "ProcessSpawnError" ? "not_installed" : "unavailable",
      );
    }
    const version = versionRun.success.stdout.trim() || null;
    if (versionRun.success.code !== 0) return result("unavailable", version);
    // Reads the CLI's account config only; it does not unlock anything.
    const accounts = yield* runner
      .run({ command: "op", args: ["account", "list", "--format", "json"], timeout: "10 seconds" })
      .pipe(Effect.option);
    if (Option.isNone(accounts) || accounts.value.code !== 0) return result("unavailable", version);
    const list = decodeAccountList(accounts.value.stdout.trim() || "[]");
    return Option.isSome(list) && list.value.length > 0
      ? result("ready", version)
      : result("no_account", version);
  }).pipe(Effect.withSpan("CredentialProvider.onePassword.status"));

  return CredentialProvider.of({ label: "1Password", status, listLogins, readSecret });
});

/** 1Password through its `op` CLI, using the user's desktop-app sign-in. */
export const layerOnePassword = Layer.effect(CredentialProvider, makeOnePassword);
