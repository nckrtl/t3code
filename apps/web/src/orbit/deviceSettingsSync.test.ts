import { mergeDeviceSection, type JsonObject } from "@t3tools/client-runtime/orbit-gateway";
import { DEFAULT_CLIENT_SETTINGS, type ClientSettings } from "@t3tools/contracts/settings";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createDesktopDeviceChannel,
  DESKTOP_SYNCED_SETTING_KEYS,
  desktopSettingsPatch,
  readDesktopDeviceSection,
} from "./deviceSettingsSync";

const section = (values: Record<string, unknown>, schema = 1): JsonObject =>
  ({ schema, values }) as JsonObject;

describe("desktop device settings", () => {
  it("syncs how the app looks and reads, and leaves machine-bound settings out", () => {
    const keys: readonly string[] = DESKTOP_SYNCED_SETTING_KEYS;
    expect(keys).toEqual(
      expect.arrayContaining([
        "fontFamilySans",
        "fontSizeInterface",
        "chatWidth",
        "glassOpacity",
        "panelAnimationDurationMs",
        "diffLayout",
        "wordWrap",
        "timestampFormat",
        "environmentIdentificationMode",
        "fontSmoothing",
        "lineHeightInterface",
        "lineHeightPrompt",
        "lineHeightCode",
        "lineHeightTerminal",
      ]),
    );
    for (const machineBound of [
      "browserProfiles",
      "browserDefaultProfileId",
      "annotationDictationUrl",
      "deviceAnnotationsUrl",
      "snapShotShortcut",
      "confirmQuit",
      "notificationMode",
      "onboardingCompletedAt",
      "favorites",
      "appearanceContrast",
    ]) {
      expect(keys).not.toContain(machineBound);
    }
  });

  it("reads only the allowlisted keys", () => {
    const read = readDesktopDeviceSection({
      ...DEFAULT_CLIENT_SETTINGS,
      chatWidth: "wide",
      fontFamilySans: "Inter",
    });
    expect(Object.keys(read.values as JsonObject).toSorted()).toEqual(
      [...DESKTOP_SYNCED_SETTING_KEYS].toSorted(),
    );
    expect(read).toMatchObject({
      schema: 1,
      values: { chatWidth: "wide", fontFamilySans: "Inter" },
    });
  });

  it("applies valid values and skips unknown keys, machine-bound keys and out-of-range values", () => {
    expect(
      desktopSettingsPatch(
        section({
          chatWidth: "full",
          fontSizeInterface: 15,
          lineHeightCode: 1.8,
          lineHeightTerminal: 7,
          glassOpacity: 9_000,
          diffLayout: "sideways",
          futureSetting: true,
          browserDefaultProfileId: "evil",
          confirmQuit: "never",
        }),
      ),
    ).toEqual({ chatWidth: "full", fontSizeInterface: 15, lineHeightCode: 1.8 });
  });

  it("writes only the settings that differ", () => {
    const update = vi.fn();
    const current: ClientSettings = { ...DEFAULT_CLIENT_SETTINGS, chatWidth: "wide" };
    const channel = createDesktopDeviceChannel({ read: () => current, update });
    channel.applyRemote(section({ chatWidth: "wide", wordWrap: !current.wordWrap }), null);
    expect(update).toHaveBeenCalledExactlyOnceWith({ wordWrap: !current.wordWrap });

    update.mockClear();
    channel.applyRemote(section({ chatWidth: "wide" }), null);
    expect(update).not.toHaveBeenCalled();
  });

  it("merges per key and keeps keys from a newer build", () => {
    const base = section({ chatWidth: "wide", wordWrap: true });
    const local = section({ chatWidth: "full", wordWrap: true });
    const remote = section({ chatWidth: "wide", wordWrap: false, iphoneOnly: 3 });
    expect(mergeDeviceSection(base, local, remote)).toEqual(
      section({ chatWidth: "full", wordWrap: false, iphoneOnly: 3 }),
    );
  });
});
