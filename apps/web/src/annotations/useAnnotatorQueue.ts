import { useEffect, useState } from "react";

import { type AnnotatorEndpoint, type AnnotatorRecord, fetchAnnotations } from "./annotatorQueue";

const FALLBACK_POLL_MS = 15_000;

/**
 * Live annotations of one annotator. `null` while unknown or when the page has no
 * annotator. The server's event stream only says "fetch again", so every change is one
 * fetch; a slow poll covers a dropped stream.
 */
export function useAnnotatorQueue(endpoint: AnnotatorEndpoint | null): AnnotatorRecord[] | null {
  const url = endpoint?.annotationsUrl ?? null;
  // Keyed by URL, so a new page never shows the previous page's queue.
  const [loaded, setLoaded] = useState<{
    url: string;
    annotations: AnnotatorRecord[] | null;
  } | null>(null);

  useEffect(() => {
    if (url === null) return;
    const controller = new AbortController();
    const load = () =>
      void fetchAnnotations(url, controller.signal).then((annotations) => {
        if (!controller.signal.aborted) setLoaded({ url, annotations });
      });
    load();
    let events: EventSource | null = null;
    try {
      events = new EventSource(`${url}/events`);
      events.addEventListener("message", load);
    } catch {
      events = null;
    }
    const timer = setInterval(load, FALLBACK_POLL_MS);
    return () => {
      controller.abort();
      events?.close();
      clearInterval(timer);
    };
  }, [url]);

  return loaded !== null && loaded.url === url ? loaded.annotations : null;
}
