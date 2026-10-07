// CSI sequences (colors, cursor moves) that CLIs print when they think they own a terminal.
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-?]*[ -/]*[@-~]`, "g");

/** Removes ANSI escape sequences so CLI output reads as plain text in the UI. */
export function stripAnsi(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, "");
}
