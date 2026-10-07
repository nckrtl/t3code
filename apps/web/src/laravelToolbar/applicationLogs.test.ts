import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { OrbitHttpRequest, OrbitHttpResponse } from "~/orbit/orbitTransport";
import { gatewayApplicationLogs, type ApplicationLogUpdate } from "./applicationLogs";

class FakeSocket extends EventTarget {
  static current: FakeSocket;
  sent: { event: string; data: unknown }[] = [];
  closed = false;
  constructor() {
    super();
    FakeSocket.current = this;
  }
  send(text: string) {
    this.sent.push(JSON.parse(text));
  }
  close() {
    this.closed = true;
  }
  message(event: string, data: unknown, channel?: string) {
    this.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ event, data: JSON.stringify(data), channel }),
      }),
    );
  }
}
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Orbit application logs", () => {
  it("activates after subscribing, appends ordered events, and closes its lease", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("WebSocket", FakeSocket);
    const requests: OrbitHttpRequest[] = [];
    const transport = async (request: OrbitHttpRequest): Promise<OrbitHttpResponse> => {
      requests.push(request);
      const data =
        request.path === "/api/v1/realtime"
          ? { url: "wss://reverb.orbit", key: "key" }
          : request.method === "POST"
            ? { id: "stream", channel: "private-log-stream.stream", auth: "signature" }
            : {};
      return { status: 200, body: { data } };
    };
    const updates: ApplicationLogUpdate[] = [];
    const stop = gatewayApplicationLogs(transport)(271, (update) => updates.push(update));
    await settle();
    const socket = FakeSocket.current;
    socket.message("pusher:connection_established", { socket_id: "1.2" });
    await settle();
    expect(requests.some((request) => request.method === "PUT")).toBe(false);
    expect(socket.sent[0]?.event).toBe("pusher:subscribe");
    socket.message("pusher_internal:subscription_succeeded", {}, "private-log-stream.stream");
    await settle();
    expect(requests.some((request) => request.method === "PUT")).toBe(true);
    socket.message(
      "log.lines",
      { id: "stream", data: { sequence: 1, lines: ["first"] } },
      "private-log-stream.stream",
    );
    socket.message(
      "log.lines",
      { id: "stream", data: { sequence: 2, lines: ["second"] } },
      "private-log-stream.stream",
    );
    socket.message(
      "log.lines",
      { id: "stream", data: { sequence: 1, lines: ["old"] } },
      "private-log-stream.stream",
    );
    expect(updates.at(-1)?.text).toBe("first\nsecond");
    stop();
    await settle();
    expect(socket.closed).toBe(true);
    expect(requests.at(-1)?.method).toBe("DELETE");
    const count = requests.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(requests).toHaveLength(count);
  });
  it("refreshes the saved tail if realtime fails and stops polling on cleanup", async () => {
    vi.useFakeTimers();
    const transport = vi.fn(async (request: OrbitHttpRequest): Promise<OrbitHttpResponse> =>
      request.path === "/api/v1/realtime"
        ? { status: 503, body: null }
        : { status: 200, body: { data: { logs: "tail" } } },
    );
    const updates: ApplicationLogUpdate[] = [];
    const stop = gatewayApplicationLogs(transport)(271, (update) => updates.push(update));
    await settle();
    expect(updates.at(-1)).toEqual({ text: "tail", status: "refreshing", error: null });
    await vi.advanceTimersByTimeAsync(3000);
    expect(transport).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(6000);
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
