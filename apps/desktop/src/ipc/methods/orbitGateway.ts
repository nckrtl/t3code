import * as Electron from "electron";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { DEFAULT_ORBIT_GATEWAY_URL } from "@t3tools/client-runtime/orbit-gateway";

import * as DesktopIpc from "../DesktopIpc.ts";
import { ORBIT_GATEWAY_SEND_CHANNEL } from "../channels.ts";

// Calls the Conn layer of the Orbit Gateway for the renderer's profile sync. It runs in the
// main process because the Gateway refuses requests that carry a page `Origin`, and Chromium's
// network stack trusts the Orbit root CA from the keychain. Only paths below /api/v1/conn are sent.

const TIMEOUT_MS = 15_000;

const OrbitGatewayRequest = Schema.Struct({
  method: Schema.Literals(["GET", "POST", "PUT"]),
  path: Schema.String.check(Schema.isPattern(/^\/[A-Za-z0-9/_.%-]{0,512}$/)),
  body: Schema.NullOr(Schema.String.check(Schema.isMaxLength(2_000_000))),
});

const OrbitGatewayResponse = Schema.Struct({
  error: Schema.NullOr(Schema.String),
  status: Schema.Int,
  body: Schema.String,
});

async function send(
  request: typeof OrbitGatewayRequest.Type,
): Promise<typeof OrbitGatewayResponse.Type> {
  try {
    const response = await Electron.net.fetch(
      `${DEFAULT_ORBIT_GATEWAY_URL}/api/v1/conn${request.path}`,
      {
        method: request.method,
        headers: {
          Accept: "application/json",
          ...(request.body === null ? {} : { "Content-Type": "application/json" }),
        },
        body: request.body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        bypassCustomProtocolHandlers: true,
      },
    );
    return { error: null, status: response.status, body: await response.text() };
  } catch (error) {
    return {
      error:
        error instanceof Error && error.name === "TimeoutError"
          ? "The Orbit Gateway did not answer in time."
          : error instanceof Error
            ? error.message
            : String(error),
      status: 0,
      body: "",
    };
  }
}

export const orbitGatewaySend = DesktopIpc.makeIpcMethod({
  channel: ORBIT_GATEWAY_SEND_CHANNEL,
  payload: OrbitGatewayRequest,
  result: OrbitGatewayResponse,
  handler: Effect.fn("desktop.ipc.orbitGateway.send")(function* (request) {
    return yield* Effect.promise(() => send(request));
  }),
});
