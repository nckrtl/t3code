import { isTemporaryWorktreeBranch, WORKTREE_BRANCH_PREFIX } from "@t3tools/shared/git";

import {
  getOrbitInstance,
  getOrbitNode,
  OrbitApiError,
  type OrbitInstance,
  registerOrbitInstance,
  resolveOrbitDirectory,
} from "./orbitApi";
import { OrbitTransportError, type OrbitTransport, shellQuote } from "./orbitTransport";

/** Runs a short `sh` script on the environment's machine. */
export type HiddenShellRunner = (
  script: string,
  timeoutSeconds: number,
) => Promise<{ readonly exitCode: number; readonly output: string }>;

/** The Orbit Instance in the project's folder, whose repository new threads branch from. */
export interface OrbitCopySource {
  readonly instanceId: number;
  readonly instanceName: string;
  readonly projectId: number;
  readonly projectSlug: string;
  readonly nodeId: number;
  readonly nodeName: string;
  readonly tld: string;
  /** Orbit's folder for this Project's checkouts, e.g. `/fast/apps/orbit-website`. */
  readonly projectAppsPath: string;
}

export type OrbitAvailability =
  | { readonly available: true; readonly source: OrbitCopySource }
  | { readonly available: false; readonly reason: string };

export const ORBIT_APP_DEV_ROLE = "app-dev";

function unavailable(reason: string): OrbitAvailability {
  return { available: false, reason };
}

export function describeOrbitError(error: unknown): string {
  if (error instanceof OrbitApiError) {
    if (error.code === "peer.identity_unknown") return "This machine is not an Orbit Node";
    return `${error.message} (${error.code})`;
  }
  if (error instanceof OrbitTransportError) return error.message;
  return error instanceof Error ? error.message : "Orbit failed.";
}

/**
 * The option is offered when the project's folder is an Orbit development
 * Instance on this machine and this machine has the app-dev role.
 */
export async function checkOrbitAvailability(
  transport: OrbitTransport,
  projectRoot: string,
): Promise<OrbitAvailability> {
  let match;
  try {
    match = await resolveOrbitDirectory(transport, projectRoot);
  } catch (error) {
    if (error instanceof OrbitApiError && error.status === 404) {
      return unavailable("This project's folder is not an Orbit instance");
    }
    return unavailable(describeOrbitError(error));
  }
  try {
    const [node, instance] = await Promise.all([
      getOrbitNode(transport, match.nodeId),
      getOrbitInstance(transport, match.instanceId),
    ]);
    if (!node.roles.includes(ORBIT_APP_DEV_ROLE)) {
      return unavailable("This machine has no app-dev role");
    }
    if (!node.tld || !instance.projectSlug) {
      return unavailable("Orbit did not report the route name parts");
    }
    // Registration moves a source into `<apps-root>/<project-slug>/<name>`;
    // a worktree created there stays put under the running agent.
    const projectAppsPath = node.appsPath
      ? `${node.appsPath.replace(/\/+$/, "")}/${instance.projectSlug}`
      : instance.checkoutPath.replace(/\/[^/]+\/?$/, "");
    return {
      available: true,
      source: {
        instanceId: instance.id,
        instanceName: instance.name,
        projectId: match.projectId,
        projectSlug: instance.projectSlug,
        nodeId: node.id,
        nodeName: node.name,
        tld: node.tld,
        projectAppsPath,
      },
    };
  } catch (error) {
    return unavailable(describeOrbitError(error));
  }
}

/**
 * Create the thread's worktree of the project's repository directly in Orbit's
 * managed path, on a new branch from the freshly fetched base branch (the
 * local one when the fetch fails). Registration later adopts it where it is.
 */
export async function createOrbitWorktree(
  run: HiddenShellRunner,
  input: {
    readonly projectRoot: string;
    readonly baseBranch: string;
    readonly temporaryBranch: string;
    readonly worktreePath: string;
  },
): Promise<void> {
  const base = shellQuote(input.baseBranch);
  const script = [
    "set -e",
    `cd ${shellQuote(input.projectRoot)}`,
    // Git's detached auto-maintenance would hold the captured output open for seconds.
    `if git -c maintenance.auto=false fetch --quiet origin ${base}; then start=${shellQuote(`origin/${input.baseBranch}`)}; else start=${base}; fi`,
    `git -c maintenance.auto=false worktree add --quiet -b ${shellQuote(input.temporaryBranch)} ${shellQuote(input.worktreePath)} "$start"`,
    // T3 uses this as the pull request base; `git branch -m` carries it along.
    `git config ${shellQuote(`branch.${input.temporaryBranch}.gh-merge-base`)} ${base}`,
  ].join("\n");
  const result = await run(script, 120);
  if (result.exitCode !== 0) {
    const detail = result.output.trim().split("\n").at(-1) ?? "";
    throw new Error(`Could not create the worktree${detail ? `: ${detail}` : "."}`);
  }
}

/** `t3code/1a2b3c4d` → `t3code-1a2b3c4d`: the worktree folder and Orbit Instance name. */
export function orbitInstanceNameForBranch(temporaryBranch: string): string {
  return temporaryBranch.replace("/", "-");
}

/** `t3code/login-redirect` → `login-redirect`, as a DNS label; null while temporary. */
export function orbitRouteSlugForBranch(branch: string): string | null {
  if (isTemporaryWorktreeBranch(branch)) return null;
  const name = branch.startsWith(`${WORKTREE_BRANCH_PREFIX}/`)
    ? branch.slice(WORKTREE_BRANCH_PREFIX.length + 1)
    : branch;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");
  return slug === "" ? null : slug;
}

// Names a model sometimes returns instead of describing the work.
const PLACEHOLDER_ROUTE_SLUGS = new Set([
  "unknown",
  "update",
  "branch",
  "feature",
  "change",
  "task",
  "work",
  "new",
]);

function slugify(text: string, maxLength: number): string | null {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug === "") return null;
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen > maxLength / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/g, "");
}

/**
 * The route's first label: T3's generated branch name, or the thread title
 * when the branch is still temporary or got a placeholder name such as
 * `t3code/unknown`, or else the Instance name.
 */
export function orbitRouteSlug(input: {
  readonly branch: string;
  readonly title: string | null;
  readonly instanceName: string;
}): string {
  const fromBranch = orbitRouteSlugForBranch(input.branch);
  if (fromBranch !== null && !PLACEHOLDER_ROUTE_SLUGS.has(fromBranch)) return fromBranch;
  const fromTitle = input.title ? slugify(input.title, 40) : null;
  if (fromTitle !== null && !PLACEHOLDER_ROUTE_SLUGS.has(fromTitle) && fromTitle !== "new-thread") {
    return fromTitle;
  }
  return fromBranch ?? input.instanceName;
}

export function orbitRouteDomain(input: {
  readonly slug: string;
  readonly projectSlug: string;
  readonly tld: string;
}): string {
  return `${input.slug}.${input.projectSlug}.${input.tld}`;
}

const ROUTE_SUFFIX_ATTEMPTS = 5;

/**
 * Hand the thread's worktree to Orbit. The route takes the slug of T3's
 * generated branch name, or the Instance name while the branch is still
 * temporary; a taken domain gets `-2`, `-3`, …
 */
export async function registerOrbitThreadWorktree(
  transport: OrbitTransport,
  input: {
    readonly worktreePath: string;
    readonly instanceName: string;
    readonly branch: string;
    readonly title: string | null;
    readonly projectId: number;
    readonly projectSlug: string;
    readonly tld: string;
  },
): Promise<OrbitInstance> {
  const slug = orbitRouteSlug(input);
  for (let attempt = 1; ; attempt += 1) {
    const candidate = attempt === 1 ? slug : `${slug.slice(0, 60)}-${attempt}`;
    try {
      return await registerOrbitInstance(transport, {
        sourcePath: input.worktreePath,
        projectId: input.projectId,
        instanceName: input.instanceName,
        domain: orbitRouteDomain({
          slug: candidate,
          projectSlug: input.projectSlug,
          tld: input.tld,
        }),
      });
    } catch (error) {
      const taken = error instanceof OrbitApiError && error.code === "route.domain_conflict";
      if (!taken || attempt === ROUTE_SUFFIX_ATTEMPTS) throw error;
    }
  }
}
