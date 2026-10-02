import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  annotationState,
  annotatorEndpointForPage,
  type AnnotatorRecord,
  buildAnnotationPrompt,
  clearDoneAnnotations,
  countAnnotations,
  openAnnotationCount,
  waitingIdsToSend,
} from "./annotatorQueue";

const record = (
  id: string,
  number: number,
  extra: Partial<AnnotatorRecord> = {},
): AnnotatorRecord => ({
  id,
  number,
  comment: `Comment ${number}`,
  status: "todo",
  ...extra,
});

describe("annotatorEndpointForPage", () => {
  it("uses the page origin and the Orbit annotator path", () => {
    expect(annotatorEndpointForPage("https://shop.test/pricing?x=1")).toEqual({
      annotationsUrl: "https://shop.test/__orbit/annotator/annotations",
      injectUrl: "https://shop.test/__orbit/annotator/inject.js",
      origin: "shop.test",
    });
  });

  it("ignores pages that are not http(s)", () => {
    expect(annotatorEndpointForPage("about:blank")).toBeNull();
    expect(annotatorEndpointForPage("not a url")).toBeNull();
  });
});

describe("annotation states", () => {
  it("maps server records to queue states", () => {
    expect(annotationState(record("a", 1))).toBe("waiting");
    expect(annotationState(record("a", 1, { question: true, summary: "Which URL?" }))).toBe(
      "question",
    );
    expect(annotationState(record("a", 1, { status: "in_progress" }))).toBe("working");
    expect(annotationState(record("a", 1, { status: "done" }))).toBe("done");
  });

  it("counts open annotations without the finished ones", () => {
    const counts = countAnnotations([
      record("a", 1),
      record("b", 2, { status: "in_progress" }),
      record("c", 3, { question: true }),
      record("d", 4, { status: "done" }),
    ]);
    expect(counts).toEqual({ waiting: 1, working: 1, question: 1, done: 1 });
    expect(openAnnotationCount(counts)).toBe(3);
  });
});

describe("waitingIdsToSend", () => {
  const annotations = [record("a", 1), record("b", 2), record("q", 3, { question: true })];

  it("sends nothing unless watching and idle", () => {
    expect(
      waitingIdsToSend({ watching: false, threadIdle: true, annotations, lastSentIds: [] }),
    ).toEqual([]);
    expect(
      waitingIdsToSend({ watching: true, threadIdle: false, annotations, lastSentIds: [] }),
    ).toEqual([]);
  });

  it("sends every waiting annotation but never a question", () => {
    expect(
      waitingIdsToSend({ watching: true, threadIdle: true, annotations, lastSentIds: [] }),
    ).toEqual(["a", "b"]);
  });

  it("does not prompt again for annotations it already sent", () => {
    expect(
      waitingIdsToSend({ watching: true, threadIdle: true, annotations, lastSentIds: ["a", "b"] }),
    ).toEqual([]);
  });

  it("prompts again when a new annotation arrives", () => {
    expect(
      waitingIdsToSend({
        watching: true,
        threadIdle: true,
        annotations: [...annotations, record("c", 4)],
        lastSentIds: ["a", "b"],
      }),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("buildAnnotationPrompt", () => {
  it("names the waiting annotations by number and the claim, complete and question calls", () => {
    const prompt = buildAnnotationPrompt({
      annotationsUrl: "https://shop.test/__orbit/annotator/annotations",
      annotations: [record("a", 1), record("b", 2, { status: "done" }), record("c", 3)],
    });
    expect(prompt).toContain("2 annotations are waiting (#1, #3)");
    expect(prompt).toContain(
      "curl -sS -X POST https://shop.test/__orbit/annotator/annotations/claim",
    );
    expect(prompt).toContain('"question":true');
    expect(prompt).toContain("never by id");
  });
});

describe("clearDoneAnnotations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("deletes only finished annotations and counts what the server removed", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      calls.push(`${init.method} ${url}`);
      return Promise.resolve(new Response(null, { status: url.endsWith("/gone") ? 404 : 200 }));
    });
    const removed = await clearDoneAnnotations("https://shop.test/__orbit/annotator/annotations", [
      record("open", 1),
      record("a b", 2, { status: "done" }),
      record("gone", 3, { status: "done" }),
      record("busy", 4, { status: "in_progress" }),
    ]);
    expect(calls).toEqual([
      "DELETE https://shop.test/__orbit/annotator/annotations/a%20b",
      "DELETE https://shop.test/__orbit/annotator/annotations/gone",
    ]);
    expect(removed).toBe(1);
  });
});
