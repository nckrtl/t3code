/**
 * Marks the input an approval prompt is about, inside the guest page, and
 * reads the page's own label for it. Runs through the webview, so it needs no
 * desktop main-process code; a failure only means no highlight.
 */

const HIGHLIGHT_KEY = "t3code.credentialHighlight";

interface ScriptableWebview {
  readonly executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
}

/** The app's primary color, so the page ring matches the active theme. */
function themeRingColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return value.length > 0 && CSS.supports("color", value) ? value : "Highlight";
}

const restoreScript = `(() => {
  const key = Symbol.for(${JSON.stringify(HIGHLIGHT_KEY)});
  const previous = window[key];
  if (previous) {
    previous.element.style.outline = previous.outline;
    previous.element.style.outlineOffset = previous.outlineOffset;
  }
  window[key] = undefined;
})()`;

/** Rings the field and returns the page's label for it, or null when none is found. */
export async function highlightCredentialField(
  webview: ScriptableWebview,
  fieldExpression: string,
): Promise<{ readonly found: boolean; readonly label: string | null }> {
  const script = `(() => {
  ${restoreScript};
  const element = ${fieldExpression};
  if (!element) return { found: false, label: null };
  const key = Symbol.for(${JSON.stringify(HIGHLIGHT_KEY)});
  window[key] = { element, outline: element.style.outline, outlineOffset: element.style.outlineOffset };
  element.style.outline = "2px solid " + ${JSON.stringify(themeRingColor())};
  element.style.outlineOffset = "2px";
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const labelledBy = (element.getAttribute("aria-labelledby") || "")
    .split(/\\s+/)
    .map((id) => document.getElementById(id)?.innerText || "")
    .join(" ");
  const text = [
    element.labels && element.labels[0] ? element.labels[0].innerText : "",
    element.getAttribute("aria-label") || "",
    labelledBy,
    element.placeholder || "",
  ].find((candidate) => candidate.trim().length > 0) || "";
  const label = text.replace(/\\s+/g, " ").trim().slice(0, 48);
  return { found: true, label: label || null };
})()`;
  try {
    const result = (await webview.executeJavaScript(script)) as {
      readonly found?: unknown;
      readonly label?: unknown;
    } | null;
    return {
      found: result?.found === true,
      label: typeof result?.label === "string" ? result.label : null,
    };
  } catch {
    return { found: false, label: null };
  }
}

export async function clearCredentialFieldHighlight(webview: ScriptableWebview): Promise<void> {
  try {
    await webview.executeJavaScript(restoreScript);
  } catch {
    // The page navigated away; nothing is left to restore.
  }
}
