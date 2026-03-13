import { describe, expect, it } from "vitest";
import { buildTileCompositeRegions, calculateTileLayout } from "../services/uploads.js";

describe("calculateTileLayout", () => {
  it("matches tile-club style sizing for a portrait image", () => {
    const layout = calculateTileLayout({
      imageWidth: 1080,
      imageHeight: 1920,
      canvasWidth: 3500,
      canvasHeight: 1080
    });

    expect(layout.maxTiles).toBe(5);
    expect(layout.tileWidth).toBe(700);
    expect(layout.tileHeight).toBe(1244);
    expect(layout.xOffset).toBe(0);
    expect(layout.yOffset).toBe(-82);
  });

  it("always draws at least one tile for very wide sources", () => {
    const layout = calculateTileLayout({
      imageWidth: 4000,
      imageHeight: 1000,
      canvasWidth: 3500,
      canvasHeight: 1080
    });

    expect(layout.maxTiles).toBe(1);
    expect(layout.tileWidth).toBeGreaterThan(0);
    expect(layout.tileHeight).toBeGreaterThan(0);
  });

  it("clips composite regions when tile is larger than canvas", () => {
    const layout = calculateTileLayout({
      imageWidth: 1080,
      imageHeight: 1920,
      canvasWidth: 3500,
      canvasHeight: 1080
    });

    const regions = buildTileCompositeRegions({
      layout,
      canvasWidth: 3500,
      canvasHeight: 1080
    });

    expect(regions.length).toBe(5);
    for (const region of regions) {
      expect(region.width).toBeLessThanOrEqual(3500);
      expect(region.height).toBeLessThanOrEqual(1080);
      expect(region.destTop).toBeGreaterThanOrEqual(0);
      expect(region.destLeft).toBeGreaterThanOrEqual(0);
    }
  });
});
