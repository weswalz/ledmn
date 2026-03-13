import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import {
  AppConfigSchema,
  DEFAULTS,
  type AppConfig,
  type PhotoAsset,
  type QueueItem,
  type QueueItemStatus
} from "@lednode/shared";
import { randomUUID } from "node:crypto";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const DEFAULT_CONFIG_FILE = path.resolve(REPO_ROOT, "config/default.json");

const ISO_NOW = () => new Date().toISOString();

type QueueRow = {
  id: string;
  table_number: string;
  message: string;
  status: QueueItemStatus;
  photo_asset_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  active_slot: number | null;
  active_text_clip: number | null;
  active_photo_clip: number | null;
  expires_at: string | null;
};

type PhotoRow = {
  id: string;
  original_filename: string;
  storage_filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  local_original_path: string;
  local_display_path: string | null;
  local_thumbnail_path: string | null;
  created_at: string;
  attached_to_queue_item_id: string | null;
};

function readFileDefaults(): Partial<AppConfig> {
  try {
    if (!fs.existsSync(DEFAULT_CONFIG_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(DEFAULT_CONFIG_FILE, "utf8");
    return JSON.parse(raw) as Partial<AppConfig>;
  } catch {
    return {};
  }
}

const FILE_DEFAULTS = readFileDefaults();

const DEFAULT_CONFIG_BASE = {
  pin: process.env.APP_PIN ?? FILE_DEFAULTS.pin ?? "1213",
  vjPin: process.env.VJ_PIN ?? FILE_DEFAULTS.vjPin ?? "6969",
  oscHost: process.env.OSC_HOST ?? FILE_DEFAULTS.oscHost ?? "127.0.0.1",
  oscPort: Number(process.env.OSC_PORT ?? FILE_DEFAULTS.oscPort ?? 2269),
  textLayer: Number(process.env.TEXT_LAYER ?? FILE_DEFAULTS.textLayer ?? 3),
  textStartSlot: Number(process.env.TEXT_START_SLOT ?? FILE_DEFAULTS.textStartSlot ?? 1),
  textClipCount: Number(process.env.TEXT_CLIP_COUNT ?? FILE_DEFAULTS.textClipCount ?? 3),
  textClearClip: Number(process.env.TEXT_CLEAR_CLIP ?? FILE_DEFAULTS.textClearClip ?? 4),
  photoLayer: Number(process.env.PHOTO_LAYER ?? FILE_DEFAULTS.photoLayer ?? 4),
  photoStartSlot: Number(process.env.PHOTO_START_SLOT ?? FILE_DEFAULTS.photoStartSlot ?? 1),
  photoClipCount: Number(process.env.PHOTO_CLIP_COUNT ?? FILE_DEFAULTS.photoClipCount ?? 3),
  photoClearClip: Number(process.env.PHOTO_CLEAR_CLIP ?? FILE_DEFAULTS.photoClearClip ?? 4),
  tileCanvasWidth: Number(
    process.env.TILE_CANVAS_WIDTH ?? FILE_DEFAULTS.tileCanvasWidth ?? DEFAULTS.tileCanvasWidth
  ),
  tileCanvasHeight: Number(
    process.env.TILE_CANVAS_HEIGHT ?? FILE_DEFAULTS.tileCanvasHeight ?? DEFAULTS.tileCanvasHeight
  ),
  oscTextDelayMs: Number(process.env.OSC_TEXT_DELAY_MS ?? FILE_DEFAULTS.oscTextDelayMs ?? DEFAULTS.oscTextDelayMs),
  autoClearAfterMs: Number(process.env.AUTO_CLEAR_AFTER_MS ?? FILE_DEFAULTS.autoClearAfterMs ?? DEFAULTS.autoClearAfterMs),
  uploadsDir: process.env.UPLOADS_DIR ?? FILE_DEFAULTS.uploadsDir ?? path.resolve(REPO_ROOT, "storage/uploads"),
  resolumeWatchDir:
    process.env.RESOLUME_WATCH_DIR ?? FILE_DEFAULTS.resolumeWatchDir ?? path.resolve(REPO_ROOT, "storage/processed"),
  queueOrdering: (process.env.QUEUE_ORDERING ?? FILE_DEFAULTS.queueOrdering ?? DEFAULTS.queueOrdering) as AppConfig["queueOrdering"],
  sessionDurationMinutes: Number(
    process.env.SESSION_DURATION_MINUTES ?? FILE_DEFAULTS.sessionDurationMinutes ?? DEFAULTS.sessionDurationMinutes
  ),
  lineWrapChars: Number(process.env.LINE_WRAP_CHARS ?? FILE_DEFAULTS.lineWrapChars ?? DEFAULTS.lineWrapChars),
  maxUploadSizeBytes: Number(
    process.env.MAX_UPLOAD_SIZE_BYTES ?? FILE_DEFAULTS.maxUploadSizeBytes ?? DEFAULTS.maxUploadSizeBytes
  )
} satisfies AppConfig;

function mapQueue(row: QueueRow): QueueItem {
  return {
    id: row.id,
    tableNumber: row.table_number,
    message: row.message,
    status: row.status,
    photoAssetId: row.photo_asset_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
    activeSlot: row.active_slot,
    activeTextClip: row.active_text_clip,
    activePhotoClip: row.active_photo_clip,
    expiresAt: row.expires_at
  };
}

function mapPhoto(row: PhotoRow): PhotoAsset {
  return {
    id: row.id,
    originalFilename: row.original_filename,
    storageFilename: row.storage_filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    width: row.width,
    height: row.height,
    localOriginalPath: row.local_original_path,
    localDisplayPath: row.local_display_path,
    localThumbnailPath: row.local_thumbnail_path,
    createdAt: row.created_at,
    attachedToQueueItemId: row.attached_to_queue_item_id
  };
}

function parseConfigValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function splitHostPort(value: unknown): { host: string; port: number } | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^([^:\s]+):(\d+)$/);
  if (!match) {
    return null;
  }

  const port = Number.parseInt(match[2], 10);
  if (!Number.isInteger(port) || port <= 0) {
    return null;
  }

  return { host: match[1], port };
}

export class LedNodeDatabase {
  private readonly db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedDbPath = dbPath ?? process.env.DB_PATH ?? path.resolve(REPO_ROOT, "storage/sqlite/lednode.db");
    fs.mkdirSync(path.dirname(resolvedDbPath), { recursive: true });
    this.db = new Database(resolvedDbPath);
    this.db.pragma("journal_mode = WAL");
    this.init();
    this.ensureBaseConfig();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS photo_assets (
        id TEXT PRIMARY KEY,
        original_filename TEXT NOT NULL,
        storage_filename TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        local_original_path TEXT NOT NULL,
        local_display_path TEXT,
        local_thumbnail_path TEXT,
        created_at TEXT NOT NULL,
        attached_to_queue_item_id TEXT
      );

      CREATE TABLE IF NOT EXISTS queue_items (
        id TEXT PRIMARY KEY,
        table_number TEXT NOT NULL,
        message TEXT NOT NULL,
        status TEXT NOT NULL,
        photo_asset_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sent_at TEXT,
        active_slot INTEGER,
        active_text_clip INTEGER,
        active_photo_clip INTEGER,
        expires_at TEXT,
        FOREIGN KEY(photo_asset_id) REFERENCES photo_assets(id)
      );
    `);
  }

  private ensureBaseConfig(): void {
    const insert = this.db.prepare(`
      INSERT INTO app_config(key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO NOTHING
    `);

    Object.entries(DEFAULT_CONFIG_BASE).forEach(([key, value]) => {
      insert.run({ key, value: JSON.stringify(value) });
    });

    insert.run({ key: "lastSlot", value: JSON.stringify(null) });
  }

  getConfig(): AppConfig {
    const rows = this.db.prepare("SELECT key, value FROM app_config").all() as Array<{ key: string; value: string }>;
    const configRaw: Record<string, unknown> = { ...DEFAULT_CONFIG_BASE };

    for (const row of rows) {
      if (row.key === "lastSlot") {
        continue;
      }
      configRaw[row.key] = parseConfigValue(row.value);
    }

    // Backward compatibility: old settings could save oscHost as "host:port".
    // Split and persist normalized values so startup never crash-loops on this.
    const legacyHostPort = splitHostPort(configRaw.oscHost);
    if (legacyHostPort) {
      configRaw.oscHost = legacyHostPort.host;
      configRaw.oscPort = legacyHostPort.port;

      const normalizeStmt = this.db.prepare(`
        INSERT INTO app_config(key, value) VALUES (@key, @value)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      normalizeStmt.run({ key: "oscHost", value: JSON.stringify(legacyHostPort.host) });
      normalizeStmt.run({ key: "oscPort", value: JSON.stringify(legacyHostPort.port) });
    }

    return AppConfigSchema.parse(configRaw);
  }

  updateConfig(patch: Partial<AppConfig>): AppConfig {
    const current = this.getConfig();
    const merged = AppConfigSchema.parse({ ...current, ...patch });
    const stmt = this.db.prepare(`
      INSERT INTO app_config(key, value) VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    Object.entries(patch).forEach(([key, value]) => {
      stmt.run({ key, value: JSON.stringify(value) });
    });

    return merged;
  }

  getLastSlot(): number | null {
    const row = this.db.prepare("SELECT value FROM app_config WHERE key = 'lastSlot'").get() as
      | { value: string }
      | undefined;
    if (!row) {
      return null;
    }
    const parsed = parseConfigValue(row.value);
    return typeof parsed === "number" ? parsed : null;
  }

  setLastSlot(slot: number): void {
    this.db
      .prepare(
        `INSERT INTO app_config(key, value) VALUES('lastSlot', @value)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run({ value: JSON.stringify(slot) });
  }

  createQueueItem(input: { tableNumber: string; message: string; photoAssetId?: string | null }): QueueItem {
    const now = ISO_NOW();
    const item: QueueItem = {
      id: randomUUID(),
      tableNumber: input.tableNumber,
      message: input.message,
      status: "queued",
      photoAssetId: input.photoAssetId ?? null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      activeSlot: null,
      activeTextClip: null,
      activePhotoClip: null,
      expiresAt: null
    };

    this.db
      .prepare(
        `INSERT INTO queue_items (
          id, table_number, message, status, photo_asset_id, created_at, updated_at,
          sent_at, active_slot, active_text_clip, active_photo_clip, expires_at
        ) VALUES (
          @id, @table_number, @message, @status, @photo_asset_id, @created_at, @updated_at,
          @sent_at, @active_slot, @active_text_clip, @active_photo_clip, @expires_at
        )`
      )
      .run({
        id: item.id,
        table_number: item.tableNumber,
        message: item.message,
        status: item.status,
        photo_asset_id: item.photoAssetId,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        sent_at: item.sentAt,
        active_slot: item.activeSlot,
        active_text_clip: item.activeTextClip,
        active_photo_clip: item.activePhotoClip,
        expires_at: item.expiresAt
      });

    if (item.photoAssetId) {
      this.attachPhotoToQueueItem(item.photoAssetId, item.id);
    }

    return item;
  }

  listQueueItems(ordering: AppConfig["queueOrdering"]): QueueItem[] {
    const order = ordering === "oldest" ? "ASC" : "DESC";
    const rows = this.db
      .prepare(
        `SELECT * FROM queue_items
         WHERE status IN ('queued', 'live')
         ORDER BY created_at ${order}`
      )
      .all() as QueueRow[];

    return rows.map(mapQueue);
  }

  getQueueItem(id: string): QueueItem | null {
    const row = this.db.prepare("SELECT * FROM queue_items WHERE id = ?").get(id) as QueueRow | undefined;
    return row ? mapQueue(row) : null;
  }

  getLiveItem(): QueueItem | null {
    const row = this.db
      .prepare("SELECT * FROM queue_items WHERE status = 'live' ORDER BY sent_at DESC LIMIT 1")
      .get() as QueueRow | undefined;
    return row ? mapQueue(row) : null;
  }

  updateQueueItem(id: string, patch: { tableNumber?: string; message?: string; photoAssetId?: string | null }): QueueItem | null {
    const existing = this.getQueueItem(id);
    if (!existing) {
      return null;
    }

    const updated: QueueItem = {
      ...existing,
      tableNumber: patch.tableNumber ?? existing.tableNumber,
      message: patch.message ?? existing.message,
      photoAssetId: patch.photoAssetId === undefined ? existing.photoAssetId : patch.photoAssetId,
      updatedAt: ISO_NOW()
    };

    this.db
      .prepare(
        `UPDATE queue_items
         SET table_number = @table_number,
             message = @message,
             photo_asset_id = @photo_asset_id,
             updated_at = @updated_at
         WHERE id = @id`
      )
      .run({
        id,
        table_number: updated.tableNumber,
        message: updated.message,
        photo_asset_id: updated.photoAssetId,
        updated_at: updated.updatedAt
      });

    if (existing.photoAssetId && existing.photoAssetId !== updated.photoAssetId) {
      this.detachPhoto(existing.photoAssetId);
    }
    if (updated.photoAssetId) {
      this.attachPhotoToQueueItem(updated.photoAssetId, updated.id);
    }

    return updated;
  }

  markQueueItemLive(id: string, live: { slot: number; textClip: number; photoClip: number | null; expiresAt: string }): QueueItem | null {
    const existing = this.getQueueItem(id);
    if (!existing) {
      return null;
    }

    const now = ISO_NOW();

    this.db
      .prepare(
        `UPDATE queue_items
         SET status = 'live',
             sent_at = @sent_at,
             active_slot = @active_slot,
             active_text_clip = @active_text_clip,
             active_photo_clip = @active_photo_clip,
             expires_at = @expires_at,
             updated_at = @updated_at
         WHERE id = @id`
      )
      .run({
        id,
        sent_at: now,
        active_slot: live.slot,
        active_text_clip: live.textClip,
        active_photo_clip: live.photoClip,
        expires_at: live.expiresAt,
        updated_at: now
      });

    return this.getQueueItem(id);
  }

  markQueueItemStatus(id: string, status: Exclude<QueueItemStatus, "live" | "queued">): QueueItem | null {
    const existing = this.getQueueItem(id);
    if (!existing) {
      return null;
    }

    this.db
      .prepare(
        `UPDATE queue_items
         SET status = @status,
             updated_at = @updated_at,
             active_slot = NULL,
             active_text_clip = NULL,
             active_photo_clip = NULL,
             expires_at = NULL
         WHERE id = @id`
      )
      .run({ id, status, updated_at: ISO_NOW() });

    return this.getQueueItem(id);
  }

  createPhotoAsset(input: Omit<PhotoAsset, "createdAt" | "attachedToQueueItemId">): PhotoAsset {
    const createdAt = ISO_NOW();

    this.db
      .prepare(
        `INSERT INTO photo_assets (
          id, original_filename, storage_filename, mime_type, size_bytes,
          width, height, local_original_path, local_display_path, local_thumbnail_path,
          created_at, attached_to_queue_item_id
        ) VALUES (
          @id, @original_filename, @storage_filename, @mime_type, @size_bytes,
          @width, @height, @local_original_path, @local_display_path, @local_thumbnail_path,
          @created_at, NULL
        )`
      )
      .run({
        id: input.id,
        original_filename: input.originalFilename,
        storage_filename: input.storageFilename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        width: input.width,
        height: input.height,
        local_original_path: input.localOriginalPath,
        local_display_path: input.localDisplayPath,
        local_thumbnail_path: input.localThumbnailPath,
        created_at: createdAt
      });

    return {
      ...input,
      createdAt,
      attachedToQueueItemId: null
    };
  }

  getPhotoAsset(id: string): PhotoAsset | null {
    const row = this.db.prepare("SELECT * FROM photo_assets WHERE id = ?").get(id) as PhotoRow | undefined;
    return row ? mapPhoto(row) : null;
  }

  attachPhotoToQueueItem(photoAssetId: string, queueItemId: string): void {
    this.db
      .prepare("UPDATE photo_assets SET attached_to_queue_item_id = ? WHERE id = ?")
      .run(queueItemId, photoAssetId);
  }

  detachPhoto(photoAssetId: string): void {
    this.db
      .prepare("UPDATE photo_assets SET attached_to_queue_item_id = NULL WHERE id = ?")
      .run(photoAssetId);
  }

  deletePhotoAsset(id: string): PhotoAsset | null {
    const photo = this.getPhotoAsset(id);
    if (!photo) {
      return null;
    }

    this.db.prepare("DELETE FROM photo_assets WHERE id = ?").run(id);
    this.db.prepare("UPDATE queue_items SET photo_asset_id = NULL WHERE photo_asset_id = ?").run(id);
    return photo;
  }

  close(): void {
    this.db.close();
  }
}
