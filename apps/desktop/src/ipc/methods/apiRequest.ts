import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopIpc from "../DesktopIpc.ts";
import { API_SEND_CHANNEL } from "../channels.ts";

// The API panel's sender. It runs in the main process so a request is not a page fetch: no
// CORS, every response header is visible, and Chromium's network stack trusts what the
// integrated browser trusts (Orbit's local CA for `*.test`).

const MAX_BODY_BYTES = 20 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

const Header = Schema.Struct({ name: Schema.String, value: Schema.String });

const ApiRequest = Schema.Struct({
  method: Schema.String.check(Schema.isPattern(/^[A-Za-z]{1,16}$/)),
  url: Schema.String.check(Schema.isMaxLength(16_384)),
  headers: Schema.Array(Header),
  body: Schema.NullOr(Schema.String),
  timeoutMs: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 600_000 }))),
});

const ApiResponse = Schema.Struct({
  error: Schema.NullOr(Schema.String),
  status: Schema.Int,
  statusText: Schema.String,
  url: Schema.String,
  headers: Schema.Array(Header),
  body: Schema.String,
  bodyEncoding: Schema.Literals(["text", "base64"]),
  size: Schema.Int,
  truncated: Schema.Boolean,
  durationMs: Schema.Number,
});

type ApiResponse = typeof ApiResponse.Type;

const TEXT_TYPE =
  /^(text\/|application\/([\w.+-]*\+)?(json|xml|javascript|x-www-form-urlencoded|graphql))/i;

function failure(url: string, error: string, durationMs: number): ApiResponse {
  return {
    error,
    status: 0,
    statusText: "",
    url,
    headers: [],
    body: "",
    bodyEncoding: "text",
    size: 0,
    truncated: false,
    durationMs,
  };
}

/** Reads at most MAX_BODY_BYTES; reports the full size when the server sent more. */
async function readBody(response: Response): Promise<{ bytes: Uint8Array; size: number }> {
  if (!response.body) return { bytes: new Uint8Array(), size: 0 };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let kept = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (kept < MAX_BODY_BYTES) {
      const slice = value.subarray(0, MAX_BODY_BYTES - kept);
      chunks.push(slice);
      kept += slice.byteLength;
    }
  }
  const bytes = new Uint8Array(kept);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, size };
}

async function send(request: typeof ApiRequest.Type): Promise<ApiResponse> {
  const started = performance.now();
  const elapsed = () => Math.round((performance.now() - started) * 10) / 10;
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return failure(request.url, "Enter a full URL, such as https://app.test/api/users.", 0);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return failure(request.url, "Only http and https URLs can be sent.", 0);
  }
  const method = request.method.toUpperCase();
  const headers = new Headers();
  for (const header of request.headers) {
    if (header.name.trim()) headers.append(header.name.trim(), header.value);
  }
  try {
    const response = await Electron.net.fetch(url.toString(), {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? null : request.body,
      signal: AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      bypassCustomProtocolHandlers: true,
    });
    const { bytes, size } = await readBody(response);
    const contentType = response.headers.get("content-type") ?? "";
    const text = contentType === "" || TEXT_TYPE.test(contentType);
    const responseHeaders: { name: string; value: string }[] = [];
    response.headers.forEach((value, name) => responseHeaders.push({ name, value }));
    return {
      error: null,
      status: response.status,
      statusText: response.statusText,
      url: response.url || url.toString(),
      headers: responseHeaders,
      body: text ? new TextDecoder().decode(bytes) : Buffer.from(bytes).toString("base64"),
      bodyEncoding: text ? "text" : "base64",
      size,
      truncated: size > bytes.byteLength,
      durationMs: elapsed(),
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The request timed out."
        : error instanceof Error
          ? error.message
          : String(error);
    return failure(url.toString(), message, elapsed());
  }
}

export const apiSend = DesktopIpc.makeIpcMethod({
  channel: API_SEND_CHANNEL,
  payload: ApiRequest,
  result: ApiResponse,
  handler: Effect.fn("desktop.ipc.api.send")(function* (request) {
    return yield* Effect.promise(() => send(request));
  }),
});
