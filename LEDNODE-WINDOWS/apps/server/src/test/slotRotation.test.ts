import { describe, expect, it } from "vitest";
import { nextSlot } from "../utils/slotRotation.js";

describe("nextSlot", () => {
  it("starts at start slot when no last slot", () => {
    expect(nextSlot(null, 1, 3)).toBe(1);
  });

  it("increments in range", () => {
    expect(nextSlot(1, 1, 3)).toBe(2);
    expect(nextSlot(2, 1, 3)).toBe(3);
  });

  it("rotates back to start", () => {
    expect(nextSlot(3, 1, 3)).toBe(1);
  });
});
