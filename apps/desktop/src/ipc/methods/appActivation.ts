import { DesktopAppActivationResponse } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as DesktopAppActivation from "../../app/DesktopAppActivation.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

export const setReady = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.DESKTOP_APP_ACTIVATION_READY_CHANNEL,
  payload: Schema.Boolean,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.appActivation.setReady")(function* (ready, event) {
    // Only the main window answers activation requests; extra windows
    // (rooms-patches) must not mark the renderer ready or not-ready.
    const main = yield* (yield* ElectronWindow.ElectronWindow).main;
    if (
      event !== undefined &&
      Option.isSome(main) &&
      main.value.webContents.id !== event.sender.id
    ) {
      return;
    }
    const activation = yield* DesktopAppActivation.DesktopAppActivation;
    yield* activation.setRendererReady(ready);
  }),
});

export const complete = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.DESKTOP_APP_ACTIVATION_COMPLETE_CHANNEL,
  payload: DesktopAppActivationResponse,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.appActivation.complete")(function* (response) {
    const activation = yield* DesktopAppActivation.DesktopAppActivation;
    yield* activation.complete(response);
  }),
});
