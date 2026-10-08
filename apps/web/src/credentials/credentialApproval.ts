import type { CredentialApprovalRequest, CredentialField } from "@t3tools/contracts";

/** One agent request to fill a saved login, waiting for the user. */
export interface PendingCredentialApproval extends CredentialApprovalRequest {
  readonly id: number;
}

interface QueuedApproval {
  readonly approval: PendingCredentialApproval;
  readonly resolve: (approved: boolean) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

let nextId = 1;
let queue: ReadonlyArray<QueuedApproval> = [];
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

/**
 * Queues an approval prompt and resolves with the user's answer. Prompts show
 * one at a time, in order; an unanswered prompt counts as denied at `deadlineMs`.
 */
export function requestCredentialApproval(
  request: CredentialApprovalRequest,
  deadlineMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const approval = { ...request, id: nextId++ };
    const timer = setTimeout(
      () => respondToCredentialApproval(approval.id, false),
      Math.max(0, deadlineMs - Date.now()),
    );
    queue = [...queue, { approval, resolve, timer }];
    emit();
  });
}

export function respondToCredentialApproval(id: number, approved: boolean): void {
  const entry = queue.find((candidate) => candidate.approval.id === id);
  if (!entry) return;
  clearTimeout(entry.timer);
  queue = queue.filter((candidate) => candidate !== entry);
  entry.resolve(approved);
  emit();
}

export function subscribeCredentialApprovals(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readCurrentCredentialApproval(): PendingCredentialApproval | null {
  return queue[0]?.approval ?? null;
}

export const CREDENTIAL_FIELD_LABELS: Record<CredentialField, string> = {
  username: "username",
  password: "password",
  otp: "one-time code",
};

/** The origin of a URL, or null when it has none. */
export function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const origin = new URL(url).origin;
    return origin === "null" ? null : origin;
  } catch {
    return null;
  }
}
