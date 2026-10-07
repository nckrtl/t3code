// Design fixtures. Dependency fields are proposed for the future package collector;
// other payload shapes match the production toolbar's data source.
import type {
  ToolbarData,
  ToolbarQuery,
  ToolbarStage,
  ToolbarHistoryRow,
} from "~/laravelToolbar/types";
import type { OrbitProcess } from "~/laravelToolbar/orbit";

export const previewDependencies: NonNullable<ToolbarData["dependencies"]> = {
  composer: [
    { name: "inertiajs/inertia-laravel", version: "3.6.1", constraint: "^3.6" },
    { name: "laravel/framework", version: "13.31.0", constraint: "^13.0" },
    { name: "laravel/tinker", version: "2.10.1", constraint: "^2.10" },
    { name: "nckrtl/laravel-toolbar", version: "0.3.8", constraint: "^0.3" },
    { name: "laravel/pint", version: "1.25.1", constraint: "^1.24", development: true },
    { name: "pestphp/pest", version: "4.3.0", constraint: "^4.0", development: true },
    {
      name: "pestphp/pest-plugin-laravel",
      version: "4.0.0",
      constraint: "^4.0",
      development: true,
    },
  ],
  javascript: [
    { name: "@inertiajs/vue3", version: "3.6.1", constraint: "^3.6" },
    { name: "vue", version: "3.5.22", constraint: "^3.5" },
    { name: "@tailwindcss/vite", version: "4.1.14", constraint: "^4.1", development: true },
    { name: "laravel-vite-plugin", version: "2.0.1", constraint: "^2.0", development: true },
    { name: "tailwindcss", version: "4.1.14", constraint: "^4.1", development: true },
    { name: "typescript", version: "5.9.3", constraint: "^5.9", development: true },
    { name: "vite", version: "7.1.12", constraint: "^7.1", development: true },
  ],
  package_manager: "pnpm",
};

export const previewQueries: readonly ToolbarQuery[] = [
  {
    sql: "select * from `sessions` where `id` = 'Wl3t9zq0b5kQhXy2' limit 1",
    duration: 0.41,
    offset: 0.051219512195121955,
    percentage: 0.01,
    is_duplicate: false,
    is_slow: false,
    file: "vendor/laravel/framework/src/Illuminate/Session/DatabaseSessionHandler.php",
    line: 96,
  },
  {
    sql: "select * from `users` where `id` = 1 limit 1",
    duration: 0.38,
    offset: 0.08292682926829269,
    percentage: 0.009268292682926829,
    is_duplicate: false,
    is_slow: false,
    file: "app/Http/Middleware/HandleInertiaRequests.php",
    line: 41,
  },
  {
    sql: "select * from `releases` where `channel` = 'stable' and `published_at` is not null order by `published_at` desc limit 1",
    duration: 1.92,
    offset: 0.14634146341463414,
    percentage: 0.04682926829268293,
    is_duplicate: false,
    is_slow: false,
    file: "app/Http/Controllers/HomeController.php",
    line: 22,
  },
  {
    sql: "select `id`, `name`, `slug` from `features` where `visible` = 1 order by `position` asc",
    duration: 0.74,
    offset: 0.20243902439024392,
    percentage: 0.018048780487804877,
    is_duplicate: false,
    is_slow: false,
    file: "app/Http/Controllers/HomeController.php",
    line: 27,
  },
  {
    sql: "select count(*) as aggregate from `downloads` where `created_at` >= '2026-09-01 00:00:00'",
    duration: 9.86,
    offset: 0.22926829268292684,
    percentage: 0.24048780487804877,
    is_duplicate: false,
    is_slow: true,
    file: "app/Support/DownloadStats.php",
    line: 18,
  },
  {
    sql: "select * from `testimonials` where `featured` = 1 order by `created_at` desc limit 3",
    duration: 0.52,
    offset: 0.4829268292682927,
    percentage: 0.012682926829268294,
    is_duplicate: false,
    is_slow: false,
    file: "app/Http/Controllers/HomeController.php",
    line: 31,
  },
  {
    sql: "select * from `users` where `users`.`id` in (4, 9, 12)",
    duration: 0.44,
    offset: 0.5024390243902439,
    percentage: 0.010731707317073172,
    is_duplicate: true,
    is_slow: false,
    file: "app/Http/Controllers/HomeController.php",
    line: 31,
  },
  {
    sql: "select * from `users` where `users`.`id` in (4, 9, 12)",
    duration: 0.47,
    offset: 0.5195121951219512,
    percentage: 0.011463414634146341,
    is_duplicate: true,
    is_slow: false,
    file: "resources/views/partials/testimonials.blade.php",
    line: 8,
  },
  {
    sql: "update `sessions` set `payload` = '…', `last_activity` = 1790967348 where `id` = 'Wl3t9zq0b5kQhXy2'",
    duration: 0.63,
    offset: 0.948780487804878,
    percentage: 0.015365853658536585,
    is_duplicate: false,
    is_slow: false,
    file: "vendor/laravel/framework/src/Illuminate/Session/DatabaseSessionHandler.php",
    line: 132,
  },
];

export const previewStages: readonly ToolbarStage[] = [
  {
    label: "Bootstrapping",
    color: "#FC3D46",
    wall_time: {
      measurement: {
        value: 8.28,
        formattedValue: "8.28ms",
      },
    },
    memory_real_delta: {
      measurement: {
        value: 0,
        formattedValue: "0 B",
      },
    },
  },
  {
    label: "Service providers",
    color: "#FF9C4D",
    wall_time: {
      measurement: {
        value: 1.44,
        formattedValue: "1.44ms",
      },
    },
    memory_real_delta: {
      measurement: {
        value: 158627.84,
        formattedValue: "154.91 KB",
      },
    },
  },
  {
    label: "Middleware in",
    color: "#FFD53D",
    wall_time: {
      measurement: {
        value: 1.7,
        formattedValue: "1.7ms",
      },
    },
    memory_real_delta: {
      measurement: {
        value: 90634.24,
        formattedValue: "88.51 KB",
      },
    },
  },
  {
    label: "Controller",
    color: "#64BAFF",
    wall_time: {
      measurement: {
        value: 1,
        formattedValue: "1ms",
      },
    },
    memory_real_delta: {
      measurement: {
        value: 26368,
        formattedValue: "25.75 KB",
      },
    },
  },
  {
    label: "View rendering",
    color: "#85F1BF",
    wall_time: {
      measurement: {
        value: 2.58,
        formattedValue: "2.58ms",
      },
    },
    memory_real_delta: {
      measurement: {
        value: 103147.52,
        formattedValue: "100.73 KB",
      },
    },
  },
  {
    label: "Middleware out",
    color: "#FFD53D",
    wall_time: {
      measurement: {
        value: 0.53,
        formattedValue: "0.53ms",
      },
    },
    memory_real_delta: {
      measurement: {
        value: 17633.28,
        formattedValue: "17.22 KB",
      },
    },
  },
  {
    label: "Preparing response",
    color: "#8D76FF",
    wall_time: {
      measurement: {
        value: 25.74,
        formattedValue: "25.74ms",
      },
    },
    memory_real_delta: {
      measurement: {
        value: -14161.92,
        formattedValue: "-13.83 KB",
      },
    },
  },
];

export const previewRequests: readonly {
  row: ToolbarHistoryRow;
  component: string | null;
  time: string;
  hasErrors: boolean;
  redirectTo: string | null;
  memory: string;
  queryCount: number;
  queryTime: number;
  modelCount: number;
}[] = [
  {
    row: {
      id: "r1",
      method: "GET",
      uri: "/",
      name: "HomeController.show",
      is_xhr: false,
      status_code: 200,
      duration: "41ms",
      response_type: "Inertia",
      follow_up: null,
    },
    component: "Home",
    time: "20:55:47",
    hasErrors: false,
    redirectTo: null,
    memory: "1.88 MB",
    queryCount: 9,
    queryTime: 15.37,
    modelCount: 14,
  },
  {
    row: {
      id: "r2",
      method: "GET",
      uri: "/",
      name: "HomeController.show",
      is_xhr: true,
      status_code: 200,
      duration: "12ms",
      response_type: "Inertia",
      follow_up: "partial",
    },
    component: "Home",
    time: "20:55:48",
    hasErrors: false,
    redirectTo: null,
    memory: "1.42 MB",
    queryCount: 1,
    queryTime: 9.86,
    modelCount: 0,
  },
  {
    row: {
      id: "r3",
      method: "GET",
      uri: "/api/releases/latest",
      name: "api.releases.latest",
      is_xhr: true,
      status_code: 200,
      duration: "18ms",
      response_type: "JSON",
      follow_up: null,
    },
    component: null,
    time: "20:55:48",
    hasErrors: false,
    redirectTo: null,
    memory: "1.12 MB",
    queryCount: 1,
    queryTime: 1.92,
    modelCount: 1,
  },
  {
    row: {
      id: "r4",
      method: "GET",
      uri: "/download",
      name: "download.show",
      is_xhr: true,
      status_code: 200,
      duration: "9ms",
      response_type: "Inertia",
      follow_up: null,
    },
    component: "Download",
    time: "20:55:50",
    hasErrors: false,
    redirectTo: null,
    memory: "1.31 MB",
    queryCount: 2,
    queryTime: 1.21,
    modelCount: 2,
  },
  {
    row: {
      id: "r5",
      method: "POST",
      uri: "/newsletter",
      name: "newsletter.subscribe",
      is_xhr: true,
      status_code: 302,
      duration: "64ms",
      response_type: "JSON",
      follow_up: null,
    },
    component: null,
    time: "20:55:52",
    hasErrors: false,
    redirectTo: "/",
    memory: "1.66 MB",
    queryCount: 4,
    queryTime: 6.84,
    modelCount: 1,
  },
  {
    row: {
      id: "r6",
      method: "GET",
      uri: "/",
      name: "HomeController.show",
      is_xhr: true,
      status_code: 200,
      duration: "22ms",
      response_type: "Inertia",
      follow_up: "redirect",
    },
    component: "Home",
    time: "20:55:52",
    hasErrors: true,
    redirectTo: null,
    memory: "1.79 MB",
    queryCount: 7,
    queryTime: 12.08,
    modelCount: 12,
  },
  {
    row: {
      id: "r7",
      method: "GET",
      uri: "/download/mac-intel",
      name: "download.platform",
      is_xhr: true,
      status_code: 404,
      duration: "23ms",
      response_type: "Inertia",
      follow_up: null,
    },
    component: "Error",
    time: "20:55:53",
    hasErrors: false,
    redirectTo: null,
    memory: "1.05 MB",
    queryCount: 1,
    queryTime: 0.41,
    modelCount: 0,
  },
];

export const previewProps: NonNullable<NonNullable<ToolbarData["inertia"]>["props"]> = {
  auth: {
    shared: true,
    type: null,
    loaded: true,
    source: {
      file: "app/Http/HandleInertiaRequests.php",
      line: 41,
    },
  },
  errors: {
    shared: true,
    type: "always",
    loaded: true,
    source: {
      file: "app/Http/Middleware.php",
      line: 72,
    },
  },
  app: {
    shared: true,
    type: null,
    loaded: true,
    source: {
      file: "app/Http/HandleInertiaRequests.php",
      line: 38,
    },
  },
  release: {
    shared: false,
    type: null,
    loaded: true,
    source: {
      file: "app/Http/HomeController.php",
      line: 22,
    },
  },
  features: {
    shared: false,
    type: null,
    loaded: true,
    source: {
      file: "app/Http/HomeController.php",
      line: 27,
    },
  },
  stats: {
    shared: false,
    type: "defer",
    loaded: false,
    source: {
      file: "app/Http/HomeController.php",
      line: 31,
    },
  },
};

export const previewPageProps = {
  errors: {},
  app: {
    name: "Drift",
  },
  release: {
    version: "1.4.2",
    channel: "stable",
    size: "38.2 MB",
    publishedAt: "2026-09-30",
  },
  features: [
    {
      id: 1,
      name: "On-device dictation",
      slug: "on-device",
    },
    {
      id: 2,
      name: "Works in any app",
      slug: "any-app",
    },
  ],
  auth: {
    user: null,
  },
};

export const previewModels: NonNullable<ToolbarData["models"]> = [
  {
    model: "App\\Models\\User",
    retrieved: 4,
    created: 0,
    updated: 0,
    deleted: 0,
  },
  {
    model: "App\\Models\\Release",
    retrieved: 1,
    created: 0,
    updated: 0,
    deleted: 0,
  },
  {
    model: "App\\Models\\Feature",
    retrieved: 6,
    created: 0,
    updated: 0,
    deleted: 0,
  },
  {
    model: "App\\Models\\Testimonial",
    retrieved: 3,
    created: 0,
    updated: 0,
    deleted: 0,
  },
];

export const previewCookies: NonNullable<NonNullable<ToolbarData["response"]>["cookies"]> = [
  {
    name: "XSRF-TOKEN",
    value: "eyJpdiI6IlR3b0xrZ2pYV3V1eEZ6c0N2Q0E9PSIsInZhbHVlIjoi…",
    path: "/",
    domain: "main.drift-website.test",
    secure: true,
    expires: "in 2 hours",
    same_site: "lax",
    http_only: false,
  },
  {
    name: "drift_website_session",
    value: "eyJpdiI6IjJ0c3Z2V3hBZ0JzT3pXbE5ZOGc9PSIsInZhbHVlIjoi…",
    path: "/",
    domain: "main.drift-website.test",
    secure: true,
    expires: "in 2 hours",
    same_site: "lax",
    http_only: true,
  },
];

export const previewProcesses: readonly OrbitProcess[] = [
  {
    id: 1,
    name: "vite",
    command: "vp dev --host=0.0.0.0",
    status: "running",
    cpu: 1.4,
    memoryBytes: 191000000,
  },
  {
    id: 2,
    name: "queue",
    command: "php artisan queue:work --tries=3",
    status: "running",
    cpu: 0.2,
    memoryBytes: 48500000,
  },
  {
    id: 3,
    name: "scheduler",
    command: "php artisan schedule:work",
    status: "running",
    cpu: 0,
    memoryBytes: 41200000,
  },
  {
    id: 4,
    name: "reverb",
    command: "php artisan reverb:start --port=8080",
    status: "stopped",
    cpu: null,
    memoryBytes: null,
  },
];

export const previewLogs: Readonly<Record<string, readonly string[]>> = {
  vite: [
    "20:41:02  VITE+ v0.3.3  ready in 812 ms",
    "20:41:02  ➜  Local:   https://main.drift-website.test:5203/",
    "20:41:02  ➜  Network: https://10.44.0.7:5203/",
    "20:41:03  LARAVEL v13.31.0  plugin v2.1.0",
    "20:41:03  ➜  APP_URL: https://main.drift-website.test",
    "20:52:18  [vite] (client) hmr update /resources/js/pages/Home.tsx",
    "20:52:18  [vite] (client) hmr update /resources/css/app.css",
    "20:53:40  [vite] (client) page reload resources/views/app.blade.php",
    "20:55:06  [vite] (client) hmr update /resources/js/components/DownloadButton.tsx",
    "20:55:44  [vite] (client) hmr update /resources/js/pages/Home.tsx, /resources/css/app.css",
  ],
  queue: [
    "20:41:04  INFO  Processing jobs from the [default] queue.",
    "20:47:12  App\\Jobs\\RecordDownload ......................... RUNNING",
    "20:47:12  App\\Jobs\\RecordDownload ...................... 18.42ms DONE",
    "20:52:30  App\\Jobs\\SyncReleaseFeed ........................ RUNNING",
    "20:52:31  App\\Jobs\\SyncReleaseFeed ..................... 412.07ms DONE",
    "20:55:52  App\\Jobs\\SendNewsletterConfirmation ............. RUNNING",
    "20:55:53  WARN  Mail transport slow to respond (1.2s)",
    "20:55:53  App\\Jobs\\SendNewsletterConfirmation ......... 1,204.88ms DONE",
  ],
  scheduler: [
    "20:41:04  INFO  Running scheduled tasks every minute.",
    "20:45:00  2026-10-02 20:45:00 Running ['artisan' releases:check] .... 96.31ms DONE",
    "20:50:00  2026-10-02 20:50:00 Running ['artisan' releases:check] .... 88.12ms DONE",
    "20:55:00  2026-10-02 20:55:00 Running ['artisan' releases:check] .... 91.70ms DONE",
    "20:55:00  2026-10-02 20:55:00 Running ['artisan' downloads:aggregate] 240.55ms DONE",
  ],
  reverb: [
    "20:41:05  INFO  Starting server on 0.0.0.0:8080 (main.drift-website.test).",
    "20:44:31  ERROR  Address already in use: 0.0.0.0:8080",
    "20:44:31  INFO  Server stopped.",
  ],
};
