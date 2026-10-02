// The parts of the Laravel Toolbar payload (nckrtl/laravel-toolbar, ToolbarData) the bar
// reads. The page sends it as `window.__LARAVEL_TOOLBAR_DATA__`, in `x-toolbar` response
// headers and from `/_toolbar/requests/{id}`. Every field is optional: older package
// versions and disabled collectors leave parts out.

export interface Measurement {
  readonly formattedValue?: string;
  readonly value?: number;
  readonly unit?: string;
}

export interface ToolbarStage {
  readonly label: string;
  readonly color?: string;
  readonly wall_time?: { readonly percentage?: number; readonly measurement?: Measurement };
  readonly memory_real_delta?: { readonly percentage?: number; readonly measurement?: Measurement };
}

export interface ToolbarQuery {
  readonly sql: string;
  readonly bindings?: readonly unknown[];
  readonly duration: number;
  readonly is_duplicate?: boolean;
  readonly is_slow?: boolean;
  readonly percentage?: number;
  readonly offset?: number;
  readonly file?: string | null;
  readonly line?: number | null;
  readonly editor_url?: string | null;
}

export interface ToolbarCookie {
  readonly name: string;
  readonly value?: string;
  readonly path?: string;
  readonly domain?: string;
  readonly same_site?: string | null;
  readonly secure?: boolean;
  readonly http_only?: boolean;
  readonly expires?: string | number | null;
}

export interface ToolbarMiddleware {
  readonly class: string;
  readonly editor_url?: string | null;
}

export interface ToolbarHistoryRow {
  readonly id: string;
  readonly is_xhr?: boolean;
  readonly method: string;
  readonly uri: string;
  readonly name?: string | null;
  readonly action?: string | null;
  readonly status_code?: number | null;
  readonly size?: string | null;
  readonly duration?: string | null;
  readonly response_type?: string | null;
}

export interface ToolbarModel {
  readonly model?: string;
  readonly retrieved?: number;
  readonly created?: number;
  readonly updated?: number;
  readonly deleted?: number;
}

export interface ToolbarData {
  readonly request_id?: string;
  readonly selected_request_id?: string;
  readonly history_row?: ToolbarHistoryRow;
  readonly request_history?: readonly ToolbarHistoryRow[];
  readonly profiler?: {
    readonly total_wall_time?: Measurement;
    readonly total_real_memory?: Measurement;
    readonly total_allocated_memory?: Measurement;
    readonly stages?: readonly ToolbarStage[];
  };
  readonly request?: {
    readonly route_name?: string | null;
    readonly route_uri?: string | null;
    readonly method?: string;
    readonly uri?: string;
    readonly ip_address?: string | null;
    readonly controller_action?: string | null;
    readonly route_editor_url?: string | null;
    readonly middleware?: readonly ToolbarMiddleware[];
    readonly is_inertia?: boolean;
    readonly headers?: Readonly<Record<string, readonly string[]>>;
    readonly view_name?: string | null;
    readonly view_data?: Readonly<Record<string, unknown>> | null;
  };
  readonly response?: {
    readonly status_code?: number;
    readonly headers?: Readonly<Record<string, readonly string[]>>;
    readonly size?: Measurement | string | null;
    readonly content_type?: string | null;
    readonly redirect_to?: string | null;
    readonly cookies?: readonly ToolbarCookie[];
  };
  readonly queries?: {
    readonly totalTime?: number;
    readonly databases?: readonly {
      readonly name?: string;
      readonly driver?: string;
      readonly tablePlusConnectionUrl?: string | null;
    }[];
    readonly queries?: readonly ToolbarQuery[];
  };
  readonly models?: readonly ToolbarModel[] | null;
  readonly laravel?: {
    readonly version?: string;
    readonly environment?: string;
    readonly timezone?: string;
    readonly locale?: string;
    readonly debug?: string | boolean;
    readonly host?: string;
  };
  readonly php?: {
    readonly version?: string;
    readonly memory_limit?: string;
    readonly max_execution_time?: string | number;
  };
  readonly inertia?: { readonly version?: string | null };
}
