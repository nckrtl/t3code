import { describe, expect, it } from "vite-plus/test";
import {
  createOrbitGatewayClient,
  OrbitGatewayError,
  type OrbitGatewayRequest,
  type OrbitGatewayWorkspace,
} from "./client.ts";
import { mergeWorkspaces, sameWorkspaces } from "./workspaceMerge.ts";

const workspace = (id: string, name = id, extra: Partial<OrbitGatewayWorkspace> = {}) =>
  ({
    id,
    name,
    color: "sky",
    icon: null,
    image: null,
    projectRefs: [],
    projectKeys: [],
    ...extra,
  }) as OrbitGatewayWorkspace;
const ids = (list: readonly OrbitGatewayWorkspace[]) =>
  list.map((entry) => `${entry.id}:${entry.name}`);

describe("mergeWorkspaces", () => {
  const base = [workspace("a"), workspace("b"), workspace("c")];

  it("keeps edits from both devices to different workspaces", () => {
    const local = [workspace("a", "A local"), workspace("b"), workspace("c")];
    const remote = [workspace("a"), workspace("b", "B remote"), workspace("c")];
    expect(ids(mergeWorkspaces(base, local, remote))).toEqual(["a:A local", "b:B remote", "c:c"]);
  });

  it("lets the local edit win when both devices changed the same workspace", () => {
    const local = [workspace("a", "mine"), workspace("b"), workspace("c")];
    const remote = [workspace("a", "theirs"), workspace("b"), workspace("c")];
    expect(ids(mergeWorkspaces(base, local, remote))).toEqual(["a:mine", "b:b", "c:c"]);
  });

  it("removes a workspace deleted on one side and untouched on the other", () => {
    expect(ids(mergeWorkspaces(base, [workspace("a"), workspace("c")], base))).toEqual([
      "a:a",
      "c:c",
    ]);
    expect(ids(mergeWorkspaces(base, base, [workspace("b"), workspace("c")]))).toEqual([
      "b:b",
      "c:c",
    ]);
  });

  it("keeps a workspace one side deleted while the other edited it", () => {
    const local = [workspace("a"), workspace("b", "edited"), workspace("c")];
    const remote = [workspace("a"), workspace("c")];
    expect(ids(mergeWorkspaces(base, local, remote))).toEqual(["a:a", "b:edited", "c:c"]);
  });

  it("keeps a workspace another device edited while this one deleted it", () => {
    const local = [workspace("a"), workspace("c")];
    const remote = [workspace("a"), workspace("b", "edited"), workspace("c")];
    expect(ids(mergeWorkspaces(base, local, remote))).toEqual(["a:a", "b:edited", "c:c"]);
  });

  it("keeps new workspaces from both sides next to their neighbours", () => {
    const local = [workspace("a"), workspace("x"), workspace("b"), workspace("c")];
    const remote = [workspace("a"), workspace("b"), workspace("c"), workspace("y")];
    expect(ids(mergeWorkspaces(base, local, remote))).toEqual(["a:a", "x:x", "b:b", "c:c", "y:y"]);
  });

  it("uses the local order when only this device reordered", () => {
    const local = [workspace("c"), workspace("a"), workspace("b")];
    const remote = [workspace("a"), workspace("b", "B remote"), workspace("c")];
    expect(ids(mergeWorkspaces(base, local, remote))).toEqual(["c:c", "a:a", "b:B remote"]);
  });

  it("compares content, not identity", () => {
    expect(
      sameWorkspaces(
        base,
        base.map((entry) => ({ ...entry })),
      ),
    ).toBe(true);
    expect(
      sameWorkspaces(base, [workspace("a", "a", { projectRefs: ["env:p"] }), base[1]!, base[2]!]),
    ).toBe(false);
  });
});

describe("createOrbitGatewayClient", () => {
  const respond = (status: number, body: unknown) => async () => ({
    status,
    body: JSON.stringify(body),
  });

  it("reads the calling node and its profile", async () => {
    const client = createOrbitGatewayClient(
      respond(200, {
        data: {
          id: 8,
          name: "nick",
          wireguard_ip: "10.44.0.6",
          profile: {
            id: 1,
            name: "Nick",
            settings_version: 2,
            updated_at: "2026-10-10T00:00:00+00:00",
          },
        },
      }),
    );
    await expect(client.me()).resolves.toEqual({
      id: 8,
      name: "nick",
      wireguardIp: "10.44.0.6",
      profile: { id: 1, name: "Nick", settingsVersion: 2, updatedAt: "2026-10-10T00:00:00+00:00" },
    });
  });

  it("sends the read version with a workspace replace and only the keys the Gateway accepts", async () => {
    const sent: OrbitGatewayRequest[] = [];
    const client = createOrbitGatewayClient(async (request) => {
      sent.push(request);
      return {
        status: 200,
        body: JSON.stringify({
          data: { profile_id: 1, version: 3, settings: { workspaces: [] }, updated_at: "now" },
        }),
      };
    });
    const extra = { ...workspace("a"), lastThread: "x" } as OrbitGatewayWorkspace;
    await client.replaceWorkspaces(1, 2, [extra]);
    expect(sent[0]).toEqual({
      method: "PUT",
      path: "/profiles/1/settings",
      body: { version: 2, settings: { workspaces: [workspace("a")] } },
    });
  });

  it("turns the Gateway's error envelope into an OrbitGatewayError", async () => {
    const client = createOrbitGatewayClient(
      respond(409, {
        error: {
          code: "t3.settings_version_conflict",
          message: "stale",
          details: { current_version: 5 },
        },
      }),
    );
    const error = await client.settings(1).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(OrbitGatewayError);
    expect(error).toMatchObject({
      code: "t3.settings_version_conflict",
      status: 409,
      details: { current_version: 5 },
    });
  });

  it("reports a transport failure as unreachable", async () => {
    const client = createOrbitGatewayClient(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(client.environments()).rejects.toMatchObject({ code: "gateway.unreachable" });
  });
});
