import { describe, expect, it } from "vitest";
import { AppConfigSchema, DEFAULTS, UpdateSettingsInputSchema } from "../src/index";

describe("shared schemas", () => {
  it("accepts baseline app config", () => {
    const parsed = AppConfigSchema.parse({
      pin: "1213",
      vjPin: "6969",
      oscHost: "127.0.0.1",
      oscPort: 2269,
      textLayer: 3,
      textStartSlot: 1,
      textClipCount: 3,
      textClearClip: 4,
      photoLayer: 4,
      photoStartSlot: 1,
      photoClipCount: 3,
      photoClearClip: 4,
      tileCanvasWidth: DEFAULTS.tileCanvasWidth,
      tileCanvasHeight: DEFAULTS.tileCanvasHeight,
      oscTextDelayMs: DEFAULTS.oscTextDelayMs,
      autoClearAfterMs: DEFAULTS.autoClearAfterMs,
      uploadsDir: "storage/uploads",
      resolumeWatchDir: "storage/processed",
      queueOrdering: "newest",
      sessionDurationMinutes: DEFAULTS.sessionDurationMinutes,
      lineWrapChars: DEFAULTS.lineWrapChars,
      maxUploadSizeBytes: DEFAULTS.maxUploadSizeBytes
    });

    expect(parsed.lineWrapChars).toBe(16);
  });

  it("rejects invalid settings patch", () => {
    const result = UpdateSettingsInputSchema.safeParse({ lineWrapChars: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects oscHost values that include a port", () => {
    const result = UpdateSettingsInputSchema.safeParse({ oscHost: "192.168.68.50:41237" });
    expect(result.success).toBe(false);
  });
});
