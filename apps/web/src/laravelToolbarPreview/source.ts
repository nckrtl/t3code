import type { ToolbarSource } from "~/laravelToolbar/context";
import type { OrbitSource } from "~/laravelToolbar/orbit";
import { useLaravelToolbarStore } from "~/laravelToolbar/store";
import type { ToolbarData } from "~/laravelToolbar/types";

import {
  previewCookies,
  previewLogs,
  previewModels,
  previewPageProps,
  previewProcesses,
  previewProps,
  previewQueries,
  previewRequests,
  previewStages,
} from "./fixtures";

export const PREVIEW_TAB_ID = "toolbar-design-preview";
const CURRENT_REQUEST_ID = "r1";

// PHP and FPM values are illustrative, so all of the current environment tabs can be designed.
const php: NonNullable<ToolbarData["php"]> = {
  version: "8.5.9",
  sapi: "fpm-fcgi",
  memory_limit: "128M",
  max_execution_time: "30",
  settings: {
    post_max_size: "8M",
    upload_max_filesize: "2M",
    max_file_uploads: "20",
    max_input_vars: "1000",
    max_input_time: "60",
    default_socket_timeout: "60",
    display_errors: "1",
    error_reporting: "22527",
    log_errors: "1",
    "opcache.validate_timestamps": "1",
    "opcache.jit": "off",
  },
  opcache: {
    enabled: true,
    memory_used: 48 * 1024 * 1024,
    memory_free: 80 * 1024 * 1024,
    hit_rate: 99.8,
    cached_scripts: 1248,
  },
  extensions: [
    "bcmath",
    "ctype",
    "curl",
    "dom",
    "intl",
    "mbstring",
    "openssl",
    "pdo_mysql",
    "redis",
    "zip",
  ],
  fpm: {
    pool: "www",
    process_manager: "dynamic",
    start_since: 8040,
    accepted_conn: 4217,
    listen_queue: 0,
    max_listen_queue: 2,
    idle_processes: 3,
    active_processes: 2,
    total_processes: 5,
    max_active_processes: 8,
    max_children_reached: 0,
    slow_requests: 1,
    settings: {
      pm: "dynamic",
      "pm.max_children": "10",
      "pm.start_servers": "3",
      "pm.min_spare_servers": "2",
      "pm.max_spare_servers": "5",
      "pm.max_requests": "500",
      request_terminate_timeout: "60s",
      request_slowlog_timeout: "5s",
      listen: "/run/php/php-fpm.sock",
    },
  },
};

const details: Readonly<Record<string, ToolbarData>> = Object.fromEntries(
  previewRequests.map(
    ({ row, component, memory, queryCount, queryTime, modelCount, hasErrors, redirectTo }) => {
      const duration = Number.parseFloat(row.duration ?? "0");
      const queries = previewQueries.slice(0, queryCount);
      const total = queries.reduce((sum, query) => sum + query.duration, 0);
      const data: ToolbarData = {
        request_id: row.id,
        history_row: row,
        profiler: {
          total_wall_time: { value: duration, formattedValue: row.duration ?? "0ms" },
          total_allocated_memory: {
            value: Number.parseFloat(memory) * 1024 * 1024,
            formattedValue: memory,
          },
          total_real_memory: { value: 382249, formattedValue: "373.29 KB" },
          stages: previewStages.map((stage) => ({
            ...stage,
            wall_time: {
              measurement: {
                value: ((stage.wall_time?.measurement?.value ?? 0) * duration) / 41.27,
              },
            },
          })),
        },
        request: {
          method: row.method,
          uri: row.uri,
          route_uri: row.uri,
          route_name: row.name ?? null,
          controller_action: `App\\Http\\Controllers\\${component ?? "Newsletter"}Controller@show`,
          route_editor_url: "app/Http/Controllers/HomeController.php:22",
          ip_address: "10.44.0.9",
          is_inertia: row.response_type === "Inertia",
          view_name: component,
          view_data: component
            ? {
                ...previewPageProps,
                errors: hasErrors ? { email: "Enter a valid email address." } : {},
              }
            : null,
          middleware: [
            { class: "Illuminate\\Session\\Middleware\\StartSession" },
            {
              class: "App\\Http\\Middleware\\HandleInertiaRequests",
              editor_url: "app/Http/Middleware/HandleInertiaRequests.php:38",
            },
            { class: "Illuminate\\Http\\Middleware\\AddLinkHeadersForPreloadedAssets" },
          ],
          headers: {
            host: ["main.drift-website.test"],
            accept: [component ? "text/html" : "application/json"],
            "x-forwarded-proto": ["https"],
          },
        },
        response: {
          status_code: row.status_code ?? 200,
          size: "9.97 KB",
          content_type: component ? "text/html; charset=utf-8" : "application/json",
          redirect_to: redirectTo,
          headers: {
            "cache-control": ["no-cache, private"],
            "content-type": [component ? "text/html; charset=utf-8" : "application/json"],
          },
          cookies: previewCookies,
        },
        queries: {
          totalTime: queryTime,
          databases: [{ name: "drift_website", driver: "mysql" }],
          queries: queries.map((query) => ({
            ...query,
            duration: total > 0 ? (query.duration * queryTime) / total : 0,
          })),
        },
        models:
          row.id === CURRENT_REQUEST_ID
            ? previewModels
            : [{ model: "App\\Models\\Release", retrieved: modelCount }],
        laravel: {
          version: "13.31.0",
          environment: "local",
          timezone: "UTC",
          locale: "en",
          debug: true,
          host: "main.drift-website.test",
        },
        php,
        inertia: {
          version: "3.6.1",
          props: component ? previewProps : null,
          render_source: { file: "app/Http/Controllers/HomeController.php", line: 22 },
          component_path: `resources/js/pages/${component ?? "Home"}.tsx`,
        },
      };
      return [row.id, data];
    },
  ),
);

/** A fresh simulated Orbit session. Controls change fixtures, never the Gateway or real processes. */
export function createPreviewSource(): ToolbarSource {
  let processes = previewProcesses.map((process) => ({ ...process }));
  const logs = new Map(
    processes.map((process) => [process.id, [...(previewLogs[process.name] ?? [])]]),
  );
  const orbit: OrbitSource = {
    page: async () => ({ domain: "main.drift-website.test", instanceId: 271, nodeName: "beast" }),
    processes: async () => processes.map((process) => ({ ...process })),
    logs: async (id, lines) => (logs.get(id) ?? []).slice(-lines).join("\n"),
    act: async (id, action) => {
      const process = processes.find((entry) => entry.id === id);
      if (!process) throw new Error("Unknown preview process.");
      processes = processes.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              status: action === "stop" ? "stopped" : "running",
              cpu: action === "stop" ? null : 0.2,
              memoryBytes: action === "stop" ? null : (entry.memoryBytes ?? 42000000),
            }
          : entry,
      );
      logs.get(id)?.push(`INFO Preview: ${action} ${process.name}`);
    },
  };
  return { fetchDetails: async (id) => details[id] ?? null, orbit };
}

// Keep one source per page so simulated process actions survive panel changes.
export const previewSource = createPreviewSource();

/** Feed the same store the desktop preload feeds, with deterministic request times. */
export function seedPreview() {
  const store = useLaravelToolbarStore.getState();
  store.receivePage(PREVIEW_TAB_ID, {
    ...details[CURRENT_REQUEST_ID],
    request_history: previewRequests.map(({ row }) => row),
  });
  for (const [id, data] of Object.entries(details)) store.receiveDetails(PREVIEW_TAB_ID, id, data);
  useLaravelToolbarStore.setState((state) => ({
    byTabId: {
      ...state.byTabId,
      [PREVIEW_TAB_ID]: {
        ...state.byTabId[PREVIEW_TAB_ID]!,
        history: previewRequests.map(({ row, time }) => ({
          row,
          receivedAt: new Date(`2026-10-07T${time}`).getTime(),
        })),
      },
    },
  }));
}
