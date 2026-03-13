import { describe, expect, it } from "vitest";
import { wrapMessage } from "../utils/wrapText.js";

describe("wrapMessage", () => {
  it("wraps on words with max 16 chars", () => {
    const wrapped = wrapMessage("WHERE IS HUNTER", 16);
    expect(wrapped).toBe("WHERE IS HUNTER");
  });

  it("preserves manual newlines and wraps per line", () => {
    const wrapped = wrapMessage("HELLO WORLD\nTHIS IS A LONGER LINE", 8);
    expect(wrapped).toBe("HELLO\nWORLD\nTHIS IS\nA LONGER\nLINE");
  });

  it("splits single long words", () => {
    const wrapped = wrapMessage("SUPERCALIFRAGILISTIC", 6);
    expect(wrapped).toBe("SUPERC\nALIFRA\nGILIST\nIC");
  });
});
