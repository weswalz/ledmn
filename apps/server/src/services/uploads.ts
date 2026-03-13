import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { PhotoAsset } from "@lednode/shared";

export type ProcessedUpload = {
  id: string;
  originalFilename: string;
  storageFilename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  localOriginalPath: string;
  localDisplayPath: string;
  localThumbnailPath: string;
};

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/heic": ".heic",
  "image/heif": ".heif"
};

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime.toLowerCase());
}

export type TileLayout = {
  tileWidth: number;
  tileHeight: number;
  maxTiles: number;
  xOffset: number;
  yOffset: number;
};

type TileCompositeRegion = {
  destLeft: number;
  destTop: number;
  srcLeft: number;
  srcTop: number;
  width: number;
  height: number;
};

export function calculateTileLayout(input: {
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}): TileLayout {
  const safeImageWidth = Math.max(1, Math.floor(input.imageWidth));
  const safeImageHeight = Math.max(1, Math.floor(input.imageHeight));
  const safeCanvasWidth = Math.max(1, Math.floor(input.canvasWidth));
  const safeCanvasHeight = Math.max(1, Math.floor(input.canvasHeight));

  const aspectRatio = safeImageWidth / safeImageHeight;
  let tileHeight = safeCanvasHeight;
  let tileWidth = Math.max(1, Math.floor(tileHeight * aspectRatio));

  const maxTiles = Math.max(1, Math.floor(safeCanvasWidth / tileWidth));

  if (maxTiles * tileWidth < safeCanvasWidth) {
    tileWidth = Math.max(1, Math.floor(safeCanvasWidth / maxTiles));
    tileHeight = Math.max(1, Math.floor(tileWidth / aspectRatio));
  }

  const yOffset = Math.floor((safeCanvasHeight - tileHeight) / 2);
  const totalWidth = maxTiles * tileWidth;
  const xOffset = Math.floor((safeCanvasWidth - totalWidth) / 2);

  return {
    tileWidth,
    tileHeight,
    maxTiles,
    xOffset,
    yOffset
  };
}

export function buildTileCompositeRegions(input: {
  layout: TileLayout;
  canvasWidth: number;
  canvasHeight: number;
}): TileCompositeRegion[] {
  const regions: TileCompositeRegion[] = [];
  const { layout } = input;

  for (let index = 0; index < layout.maxTiles; index += 1) {
    const destX = layout.xOffset + index * layout.tileWidth;
    const destY = layout.yOffset;

    const clippedLeft = Math.max(0, destX);
    const clippedTop = Math.max(0, destY);
    const clippedRight = Math.min(input.canvasWidth, destX + layout.tileWidth);
    const clippedBottom = Math.min(input.canvasHeight, destY + layout.tileHeight);

    const width = clippedRight - clippedLeft;
    const height = clippedBottom - clippedTop;

    if (width <= 0 || height <= 0) {
      continue;
    }

    regions.push({
      destLeft: clippedLeft,
      destTop: clippedTop,
      srcLeft: clippedLeft - destX,
      srcTop: clippedTop - destY,
      width,
      height
    });
  }

  return regions;
}

export async function processPhotoUpload(input: {
  uploadsDir: string;
  processedDir: string;
  thumbnailsDir: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  sizeBytes: number;
  tileCanvasWidth?: number;
  tileCanvasHeight?: number;
}): Promise<ProcessedUpload> {
  const id = randomUUID();
  const safeBase = `${Date.now()}-${id}`;
  const normalizedMime = input.mimeType.toLowerCase();
  const fromName = path.extname(input.originalName).toLowerCase();
  const originalExt = MIME_EXT[normalizedMime] ?? (fromName || ".img");
  const originalFile = `${safeBase}-original${originalExt}`;
  const displayFile = `${safeBase}.jpg`;
  const thumbFile = `${safeBase}-thumb.jpg`;

  await fs.mkdir(input.uploadsDir, { recursive: true });
  await fs.mkdir(input.processedDir, { recursive: true });
  await fs.mkdir(input.thumbnailsDir, { recursive: true });

  const originalPath = path.resolve(input.uploadsDir, originalFile);
  const displayPath = path.resolve(input.processedDir, displayFile);
  const thumbnailPath = path.resolve(input.thumbnailsDir, thumbFile);

  // Preserve untouched source upload as an emergency fallback if tiling result is not desired.
  await fs.writeFile(originalPath, input.buffer);

  const image = sharp(input.buffer, { failOnError: false }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read uploaded image dimensions");
  }

  const canvasWidth = Math.max(1, Math.floor(input.tileCanvasWidth ?? 3500));
  const canvasHeight = Math.max(1, Math.floor(input.tileCanvasHeight ?? 1080));
  await renderTiledJpeg({
    source: image.clone(),
    canvasWidth,
    canvasHeight,
    outputPath: displayPath
  });

  await sharp(displayPath)
    .resize({
      width: 360,
      height: 360,
      fit: "cover"
    })
    .jpeg({ quality: 82 })
    .toFile(thumbnailPath);

  return {
    id,
    originalFilename: input.originalName,
    storageFilename: displayFile,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    localOriginalPath: originalPath,
    localDisplayPath: displayPath,
    localThumbnailPath: thumbnailPath
  };
}

export async function copyToWatchFolder(displayPath: string, watchDir: string, slot: number): Promise<string> {
  await fs.mkdir(watchDir, { recursive: true });
  const target = path.resolve(watchDir, `slot-${slot}.jpg`);
  await fs.copyFile(displayPath, target);
  return target;
}

async function renderTiledJpeg(input: {
  source: sharp.Sharp;
  canvasWidth: number;
  canvasHeight: number;
  outputPath: string;
}): Promise<void> {
  const metadata = await input.source.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read uploaded image dimensions");
  }

  const layout = calculateTileLayout({
    imageWidth: metadata.width,
    imageHeight: metadata.height,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight
  });

  const tileBuffer = await input.source
    .clone()
    .resize({
      width: layout.tileWidth,
      height: layout.tileHeight,
      fit: "fill"
    })
    .jpeg({ quality: 92 })
    .toBuffer();

  const regions = buildTileCompositeRegions({
    layout,
    canvasWidth: input.canvasWidth,
    canvasHeight: input.canvasHeight
  });
  const composites = await Promise.all(
    regions.map(async (region) => {
      const clipped = await sharp(tileBuffer)
        .extract({
          left: region.srcLeft,
          top: region.srcTop,
          width: region.width,
          height: region.height
        })
        .toBuffer();

      return {
        input: clipped,
        left: region.destLeft,
        top: region.destTop
      };
    })
  );

  await sharp({
    create: {
      width: input.canvasWidth,
      height: input.canvasHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 }
    }
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(input.outputPath);
}

function chooseSourceFile(photo: PhotoAsset): string {
  if (photo.localOriginalPath) {
    return photo.localOriginalPath;
  }
  if (photo.localDisplayPath) {
    return photo.localDisplayPath;
  }
  throw new Error("Photo asset has no source file to publish");
}

function resolveOriginalExtension(photo: PhotoAsset, sourcePath: string): string {
  const fromSource = path.extname(sourcePath).toLowerCase();
  if (fromSource) {
    return fromSource;
  }

  const fromOriginalName = path.extname(photo.originalFilename).toLowerCase();
  if (fromOriginalName) {
    return fromOriginalName;
  }

  const fromMime = MIME_EXT[photo.mimeType.toLowerCase()];
  if (fromMime) {
    return fromMime;
  }

  return ".img";
}

export async function publishPhotoToWatchFolder(input: {
  photo: PhotoAsset;
  watchDir: string;
  slot: number;
  tileCanvasWidth: number;
  tileCanvasHeight: number;
}): Promise<{ tiledPath: string; originalPath: string }> {
  await fs.mkdir(input.watchDir, { recursive: true });

  const sourcePath = chooseSourceFile(input.photo);
  const tiledPath = path.resolve(input.watchDir, `slot-${input.slot}.jpg`);
  const originalExt = resolveOriginalExtension(input.photo, sourcePath);
  const originalPath = path.resolve(input.watchDir, `slot-${input.slot}-original${originalExt}`);

  await renderTiledJpeg({
    source: sharp(sourcePath, { failOnError: false }).rotate(),
    canvasWidth: Math.max(1, Math.floor(input.tileCanvasWidth)),
    canvasHeight: Math.max(1, Math.floor(input.tileCanvasHeight)),
    outputPath: tiledPath
  });

  await fs.copyFile(sourcePath, originalPath);
  return { tiledPath, originalPath };
}
