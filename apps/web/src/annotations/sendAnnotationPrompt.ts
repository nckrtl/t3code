import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { latestCompletedToolActivityId, useQueuedMessageStore } from "../queuedMessageStore";
import { readThread, readThreadShell } from "../state/entities";
import { type AnnotatorRecord, annotationState, buildAnnotationPrompt } from "./annotatorQueue";
import { useAnnotationWatchStore } from "./annotationWatchStore";

/**
 * Queues the annotation prompt as a normal user message with the thread's own model and
 * modes. T3's queue sends it as soon as the thread can take it, from the main window.
 * Returns false when there is nothing to send or the thread is unknown.
 */
export function sendAnnotationPrompt(input: {
  readonly threadRef: ScopedThreadRef;
  readonly annotationsUrl: string;
  readonly annotations: ReadonlyArray<AnnotatorRecord>;
}): boolean {
  const waiting = input.annotations.filter(
    (annotation) => annotationState(annotation) === "waiting",
  );
  const shell = readThreadShell(input.threadRef);
  if (waiting.length === 0 || shell === null) return false;
  const threadKey = scopedThreadKey(input.threadRef);
  useQueuedMessageStore.getState().enqueue(threadKey, {
    prompt: buildAnnotationPrompt(input),
    images: [],
    files: [],
    terminalContexts: [],
    previewAnnotations: [],
    reviewComments: [],
    sendSettings: {
      modelSelection: shell.modelSelection,
      runtimeMode: shell.runtimeMode,
      interactionMode: shell.interactionMode,
      promptEffort: null,
    },
    queuedAfterToolActivityId: latestCompletedToolActivityId(
      readThread(input.threadRef)?.activities ?? [],
    ),
    createdAt: new Date().toISOString(),
  });
  useAnnotationWatchStore.getState().markSent(
    threadKey,
    waiting.map((annotation) => annotation.id),
  );
  return true;
}
