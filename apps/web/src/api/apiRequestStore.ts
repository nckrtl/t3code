import type { DesktopApiResponse } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";

// The API panel's saved requests, per project (persisted), and the last response per request
// (this session only: bodies can be large).

export const API_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export interface ApiHeaderRow {
  readonly id: string;
  readonly name: string;
  readonly value: string;
  readonly enabled: boolean;
}

export interface ApiRequestDraft {
  readonly id: string;
  readonly method: string;
  readonly url: string;
  readonly headers: readonly ApiHeaderRow[];
  readonly body: string;
}

export interface ApiProjectRequests {
  readonly requests: readonly ApiRequestDraft[];
  readonly selectedId: string | null;
}

export interface ApiResult {
  readonly response: DesktopApiResponse | null;
  readonly sending: boolean;
}

const EMPTY_PROJECT: ApiProjectRequests = { requests: [], selectedId: null };

export const newRowId = () => Math.random().toString(36).slice(2, 10);

/** New requests ask JSON and opt in to the toolbar header, so Laravel data comes back. */
export function newApiRequest(baseUrl: string | null): ApiRequestDraft {
  return {
    id: newRowId(),
    method: "GET",
    url: baseUrl ? baseUrl.replace(/\/+$/, "") + "/" : "",
    headers: [
      { id: newRowId(), name: "Accept", value: "application/json", enabled: true },
      { id: newRowId(), name: "X-Toolbar", value: "1", enabled: true },
    ],
    body: "",
  };
}

/** `GET /api/users`: the method and the URL's path, for menus and tab titles. */
export function apiRequestLabel(request: Pick<ApiRequestDraft, "method" | "url">): string {
  let path = request.url.trim();
  try {
    const url = new URL(path);
    path = `${url.pathname}${url.search}`;
  } catch {
    // Not a full URL yet; show what was typed.
  }
  return `${request.method} ${path || "New request"}`;
}

interface ApiRequestState {
  readonly byProjectKey: Readonly<Record<string, ApiProjectRequests>>;
  readonly results: Readonly<Record<string, ApiResult>>;
  readonly add: (projectKey: string, request: ApiRequestDraft) => void;
  readonly change: (projectKey: string, id: string, patch: Partial<ApiRequestDraft>) => void;
  readonly select: (projectKey: string, id: string) => void;
  readonly remove: (projectKey: string, id: string) => void;
  readonly setResult: (id: string, result: ApiResult) => void;
}

function updateProject(
  state: ApiRequestState,
  projectKey: string,
  change: (project: ApiProjectRequests) => ApiProjectRequests,
): Pick<ApiRequestState, "byProjectKey"> {
  return {
    byProjectKey: {
      ...state.byProjectKey,
      [projectKey]: change(state.byProjectKey[projectKey] ?? EMPTY_PROJECT),
    },
  };
}

export const useApiRequestStore = create<ApiRequestState>()(
  persist(
    (set) => ({
      byProjectKey: {},
      results: {},
      add: (projectKey, request) =>
        set((state) =>
          updateProject(state, projectKey, (project) => ({
            requests: [...project.requests, request],
            selectedId: request.id,
          })),
        ),
      change: (projectKey, id, patch) =>
        set((state) =>
          updateProject(state, projectKey, (project) => ({
            ...project,
            requests: project.requests.map((request) =>
              request.id === id ? { ...request, ...patch, id } : request,
            ),
          })),
        ),
      select: (projectKey, id) =>
        set((state) =>
          updateProject(state, projectKey, (project) => ({ ...project, selectedId: id })),
        ),
      remove: (projectKey, id) =>
        set((state) => {
          const { [id]: _removed, ...results } = state.results;
          return {
            ...updateProject(state, projectKey, (project) => {
              const index = project.requests.findIndex((request) => request.id === id);
              const requests = project.requests.filter((request) => request.id !== id);
              const neighbour = requests[Math.min(index, requests.length - 1)] ?? null;
              return {
                requests,
                selectedId:
                  project.selectedId === id ? (neighbour?.id ?? null) : project.selectedId,
              };
            }),
            results,
          };
        }),
      setResult: (id, result) => set((state) => ({ results: { ...state.results, [id]: result } })),
    }),
    {
      name: "t3code:api-requests:v1",
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ byProjectKey: state.byProjectKey }),
    },
  ),
);
