import { callOrbit } from "~/orbit/orbitApi";
import type { OrbitTransport } from "~/orbit/orbitTransport";

export interface ApplicationLogUpdate {
  readonly text: string;
  readonly status: "connecting" | "live" | "refreshing";
  readonly error: string | null;
}
export type FollowApplicationLogs = (
  instanceId: number,
  onUpdate: (update: ApplicationLogUpdate) => void,
) => () => void;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function decode(value: unknown): Record<string, unknown> | null {
  try {
    return record(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return null;
  }
}

/** Pusher/Reverb log channel, leased through the thread's WireGuard identity. */
export function gatewayApplicationLogs(transport: OrbitTransport): FollowApplicationLogs {
  return (instanceId, onUpdate) => {
    const path = `/api/v1/instances/${instanceId}`;
    let stopped = false;
    let socket: WebSocket | null = null;
    let streamId: string | null = null;
    let channel: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let renewTimer: ReturnType<typeof setTimeout> | undefined;
    let text = "";
    let received = false;
    let sequence = 0;
    const emit = (status: ApplicationLogUpdate["status"], error: string | null = null) => {
      if (!stopped) onUpdate({ text, status, error });
    };
    const closeStream = (id: string) =>
      void callOrbit(transport, {
        method: "DELETE",
        path: `${path}/log-streams/${id}`,
      }).catch(() => {});
    const closeLive = () => {
      clearTimeout(renewTimer);
      if (socket) {
        const current = socket;
        socket = null;
        current.close();
      }
      if (streamId) {
        closeStream(streamId);
        streamId = null;
      }
    };
    const poll = async () => {
      if (stopped) return;
      try {
        const data = record(
          await callOrbit(transport, {
            method: "GET",
            path: `${path}/logs`,
            query: { lines: "200" },
          }),
        );
        if (stopped) return;
        text = typeof data?.logs === "string" ? data.logs : "";
        emit("refreshing");
      } catch (error) {
        emit(
          "refreshing",
          error instanceof Error ? error.message : "Could not read the application log.",
        );
      }
      if (!stopped) timer = setTimeout(() => void poll(), 3000);
    };
    const fallback = () => {
      if (stopped) return;
      clearTimeout(timer);
      closeLive();
      emit("refreshing");
      void poll();
    };
    const renew = async () => {
      const id = streamId;
      if (!id || stopped) return;
      try {
        await callOrbit(transport, { method: "PUT", path: `${path}/log-streams/${id}`, body: {} });
        if (!stopped && id === streamId) renewTimer = setTimeout(() => void renew(), 20000);
      } catch {
        fallback();
      }
    };
    const connect = async () => {
      try {
        const config = record(
          await callOrbit(transport, { method: "GET", path: "/api/v1/realtime" }),
        );
        if (stopped) return;
        if (typeof config?.url !== "string" || typeof config.key !== "string")
          throw new Error("Realtime unavailable");
        const url = new URL(config.url);
        url.pathname = `/app/${encodeURIComponent(config.key)}`;
        url.search = "protocol=7&client=t3code&version=1";
        socket = new WebSocket(url);
        const current = socket;
        timer = setTimeout(fallback, 15000);
        current.addEventListener("error", () => {
          if (current === socket) fallback();
        });
        current.addEventListener("close", () => {
          if (current === socket) fallback();
        });
        current.addEventListener("message", (event) => {
          const message = decode(event.data);
          const data = decode(message?.data);
          if (stopped || current !== socket) return;
          if (message?.event === "pusher:ping") {
            current.send(JSON.stringify({ event: "pusher:pong", data: {} }));
          } else if (
            message?.event === "pusher:connection_established" &&
            typeof data?.socket_id === "string"
          ) {
            void callOrbit(transport, {
              method: "POST",
              path: `${path}/log-streams`,
              body: { socket_id: data.socket_id, lines: 200 },
            })
              .then((value) => {
                const opened = record(value);
                if (typeof opened?.id !== "string") throw new Error("Invalid log stream");
                if (stopped || current !== socket) {
                  closeStream(opened.id);
                  return;
                }
                if (typeof opened.channel !== "string" || typeof opened.auth !== "string") {
                  closeStream(opened.id);
                  throw new Error("Invalid log channel");
                }
                streamId = opened.id;
                channel = opened.channel;
                current.send(
                  JSON.stringify({
                    event: "pusher:subscribe",
                    data: { channel, auth: opened.auth },
                  }),
                );
              })
              .catch(fallback);
          } else if (
            message?.channel === channel &&
            message.event === "pusher_internal:subscription_succeeded"
          ) {
            clearTimeout(timer);
            emit("live");
            void renew();
          } else if (message?.channel === channel && message.event === "log.lines") {
            const payload = record(data?.data);
            if (!payload || (typeof data?.id === "string" && data.id !== streamId)) return;
            if (typeof payload.sequence === "number") {
              if (payload.sequence <= sequence) return;
              sequence = payload.sequence;
            }
            const lines = Array.isArray(payload.lines)
              ? payload.lines.filter((line): line is string => typeof line === "string")
              : [];
            if (typeof payload.dropped === "number" && payload.dropped > 0)
              lines.unshift(`[orbit] ${payload.dropped} lines dropped`);
            if (typeof payload.skipped === "number" && payload.skipped > 0)
              lines.unshift(`[orbit] ${payload.skipped} bytes skipped`);
            text = [...(received ? text.split("\n") : []), ...lines].slice(-2000).join("\n");
            received = true;
            emit("live");
          } else if (message?.event === "log.ended" || message?.event === "pusher:error") {
            fallback();
          }
        });
      } catch {
        fallback();
      }
    };
    emit("connecting");
    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      closeLive();
    };
  };
}
