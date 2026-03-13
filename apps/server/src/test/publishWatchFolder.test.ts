import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { PhotoAsset } from "@lednode/shared";
import { publishPhotoToWatchFolder } from "../services/uploads.js";

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "lednode-watch-"));
}

describe("publishPhotoToWatchFolder", () => {
  it("always writes a tiled slot image and a preserved original file", async () => {
    const tempDir = await makeTempDir();
    const sourcePath = path.join(tempDir, "source-noext");

    const sourceBuffer = await sharp({
      create: {
        width: 640,
        height: 960,
        channels: 3,
        background: { r: 255, g: 120, b: 60 }
      }
    })
      .png()
      .toBuffer();

    await fs.writeFile(sourcePath, sourceBuffer);

    const photo: PhotoAsset = {
      id: "7f4cb7f4-9d06-4e0f-8801-5e01f1cba8ba",
      originalFilename: "IMG_5004.png",
      storageFilename: "unused.jpg",
      mimeType: "image/png",
      sizeBytes: sourceBuffer.length,
      width: 640,
      height: 960,
      localOriginalPath: sourcePath,
      localDisplayPath: null,
      localThumbnailPath: null,
      createdAt: new Date().toISOString(),
      attachedToQueueItemId: null
    };

    const result = await publishPhotoToWatchFolder({
      photo,
      watchDir: tempDir,
      slot: 12,
      tileCanvasWidth: 3500,
      tileCanvasHeight: 1080
    });

    expect(path.basename(result.tiledPath)).toBe("slot-12.jpg");
    expect(path.basename(result.originalPath)).toBe("slot-12-original.png");

    const tiledMeta = await sharp(result.tiledPath).metadata();
    expect(tiledMeta.width).toBe(3500);
    expect(tiledMeta.height).toBe(1080);

    const originalMeta = await sharp(result.originalPath).metadata();
    expect(originalMeta.width).toBe(640);
    expect(originalMeta.height).toBe(960);
  });
});
