import type { ScopedThreadRef } from "@t3tools/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

import { fetchAnnotations } from "~/annotations/annotatorQueue";
import { useAnnotatorQueue } from "~/annotations/useAnnotatorQueue";
import { useClientSettings } from "~/hooks/useSettings";

import { annotationsForPathname, deviceAnnotationPathname } from "./deviceAnnotations";

/** Queue session for one device. The standing annotator is checked as soon as the screen is visible. */
export function useDeviceAnnotator(input: {
  readonly threadRef: ScopedThreadRef;
  readonly hostId: string;
  readonly deviceId: string;
  readonly visible: boolean;
}) {
  const [annotating, setAnnotating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [annotator, setAnnotator] = useState<{ url: string | null; error: string | null }>({
    url: null,
    error: null,
  });
  const startingRef = useRef(false);
  const deviceAnnotationsUrl = useClientSettings((settings) => settings.deviceAnnotationsUrl);
  const pathname = deviceAnnotationPathname(input.hostId, input.deviceId);
  const annotatorEndpoint = useMemo(
    () =>
      annotator.url === null
        ? null
        : { annotationsUrl: annotator.url, injectUrl: "", origin: pathname },
    [annotator.url, pathname],
  );
  const queue = useAnnotatorQueue(annotatorEndpoint);
  const annotations = useMemo(
    () => (queue === null ? null : annotationsForPathname(queue, pathname)),
    [pathname, queue],
  );

  // Load the queue while the screen is up, so the count is visible before annotation mode starts.
  useEffect(() => {
    if (!input.visible) return;
    const url = deviceAnnotationsUrl.trim();
    if (url === "") return;
    let active = true;
    void fetchAnnotations(url).then((records) => {
      if (!active || records === null) return;
      setAnnotator((current) => (current.url === url ? current : { url, error: null }));
    });
    return () => {
      active = false;
    };
  }, [deviceAnnotationsUrl, input.visible]);

  const toggle = () => {
    if (annotating) {
      setAnnotating(false);
      return;
    }
    if (startingRef.current) return;
    const url = deviceAnnotationsUrl.trim();
    if (url === "") {
      setAnnotator({ url: null, error: "Set a device annotations URL in Settings." });
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setAnnotator((current) => ({ url: current.url, error: null }));
    void fetchAnnotations(url).then((records) => {
      startingRef.current = false;
      setStarting(false);
      if (records === null) {
        setAnnotator({ url: null, error: `No annotation server answers at ${url}.` });
        return;
      }
      setAnnotator({ url, error: null });
      setAnnotating(true);
    });
  };

  return {
    threadRef: input.threadRef,
    hostId: input.hostId,
    deviceId: input.deviceId,
    annotating,
    annotations,
    annotationsUrl: annotator.url,
    error: annotator.error,
    starting,
    unreachable: annotator.url !== null && queue === null,
    toggle,
  };
}
