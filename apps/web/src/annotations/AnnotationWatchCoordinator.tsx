import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { derivePendingRequests } from "@t3tools/client-runtime/pending-requests";
import { useEffect, useEffectEvent, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  hasServerAcknowledgedLocalDispatch,
  latestTurnStartFailureId,
} from "../components/ChatView.logic";
import { useQueuedMessageStore, useQueuedMessages } from "../queuedMessageStore";
import { derivePhase } from "../session-logic";
import { useThread, useThreadStatus } from "../state/entities";
import { useEnvironment } from "../state/environments";
import { waitingIdsToSend } from "./annotatorQueue";
import { useAnnotationWatchStore } from "./annotationWatchStore";
import { sendAnnotationPrompt } from "./sendAnnotationPrompt";
import { useAnnotatorQueue } from "./useAnnotatorQueue";

/**
 * Watch mode: prompts each watched thread when it is idle and annotations it has not
 * been told about are waiting. Mounted once, in the main window, next to the queued
 * message sender that does the actual send.
 */
export function AnnotationWatchCoordinator() {
  const threadKeys = useAnnotationWatchStore(
    useShallow((state) => Object.keys(state.watchingByThreadKey)),
  );
  return threadKeys.map((threadKey) => (
    <ThreadAnnotationWatch key={threadKey} threadKey={threadKey} />
  ));
}

function ThreadAnnotationWatch({ threadKey }: { threadKey: string }) {
  const threadRef = useMemo(() => parseScopedThreadKey(threadKey), [threadKey]);
  const annotationsUrl = useAnnotationWatchStore(
    (state) => state.watchingByThreadKey[threadKey]?.annotationsUrl ?? null,
  );
  const lastSentIds = useAnnotationWatchStore(
    (state) => state.lastSentIdsByThreadKey[threadKey] ?? EMPTY_IDS,
  );
  const endpoint = useMemo(
    () => (annotationsUrl === null ? null : { annotationsUrl, injectUrl: "", origin: "" }),
    [annotationsUrl],
  );
  const annotations = useAnnotatorQueue(endpoint);
  const threadIdle = useThreadIdle(threadKey);

  const toSend = waitingIdsToSend({
    watching: annotationsUrl !== null,
    threadIdle,
    annotations: annotations ?? [],
    lastSentIds,
  });
  const sendKey = toSend.join(",");
  const send = useEffectEvent(() => {
    if (threadRef === null || annotationsUrl === null || annotations === null) return;
    sendAnnotationPrompt({ threadRef, annotationsUrl, annotations });
  });
  // Keyed on the ids to send; the annotations array changes identity on every fetch.
  useEffect(() => {
    if (sendKey !== "") send();
  }, [sendKey]);
  return null;
}

const EMPTY_IDS: string[] = [];

/** The same "can take a message now" rules the queued message sender uses, plus an empty queue. */
function useThreadIdle(threadKey: string): boolean {
  const threadRef = useMemo(() => parseScopedThreadKey(threadKey), [threadKey]);
  const thread = useThread(threadRef);
  const threadStatus = useThreadStatus(threadRef);
  const environment = useEnvironment(threadRef?.environmentId ?? null);
  const queue = useQueuedMessages(threadKey);
  const pendingRequests = useMemo(
    () => derivePendingRequests(thread?.activities ?? []),
    [thread?.activities],
  );
  const phase = derivePhase(thread?.session ?? null);
  const lastDispatch = useQueuedMessageStore(
    (state) => state.lastDispatchByThreadKey[threadKey]?.thread ?? null,
  );
  if (threadRef === null || thread === null || threadStatus !== "live") return false;
  if (environment !== null && environment.connection.phase !== "connected") return false;
  if (queue.length > 0) return false;
  if (phase === "running" || phase === "connecting") return false;
  if (pendingRequests.approvals.length > 0 || pendingRequests.userInputs.length > 0) return false;
  const latestUserMessageId = thread.messages.findLast((m) => m.role === "user")?.id ?? null;
  return (
    lastDispatch === null ||
    hasServerAcknowledgedLocalDispatch({
      localDispatch: lastDispatch,
      phase,
      latestTurn: thread.latestTurn ?? null,
      latestUserMessageId,
      session: thread.session ?? null,
      hasPendingApproval: false,
      hasPendingUserInput: false,
      latestTurnStartFailureId: latestTurnStartFailureId(thread, latestUserMessageId),
      threadError: null,
    })
  );
}
