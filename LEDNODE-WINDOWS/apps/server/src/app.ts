import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createServer, type Server as HttpServer } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import session from "express-session";
import multer from "multer";
import { Server as SocketIOServer } from "socket.io";
import {
  CreateQueueItemInputSchema,
  PinInputSchema,
  PublicConfigSchema,
  UpdateQueueItemInputSchema,
  UpdateSettingsInputSchema,
  type QueueItem,
  type SocketEvents
} from "@lednode/shared";
import { LedNodeDatabase } from "./services/db.js";
import { OscService } from "./services/osc.js";
import { isAllowedImageMime, processPhotoUpload, publishPhotoToWatchFolder } from "./services/uploads.js";
import { nextSlot } from "./utils/slotRotation.js";
import { sleep } from "./utils/sleep.js";
import { wrapMessage } from "./utils/wrapText.js";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const PROCESSED_DIR = path.resolve(REPO_ROOT, "storage/processed");
const THUMBNAILS_DIR = path.resolve(REPO_ROOT, "storage/thumbnails");

type OscStatus = "connected" | "connecting" | "disconnected" | "degraded";

type ServerStatus = {
  osc: OscStatus;
  lastOscOkAt: string | null;
};

type TimerState = Map<string, NodeJS.Timeout>;

type CreateAppOptions = {
  dbPath?: string;
};

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unknown error";
}

function routeId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

export function createLedNodeApp(options: CreateAppOptions = {}): {
  app: express.Express;
  httpServer: HttpServer;
  io: SocketIOServer;
  close: () => Promise<void>;
} {
  const isProduction = process.env.NODE_ENV === "production";
  const allowedOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowAnyOrigin = allowedOrigins.length === 0;
  const allowOrigin = (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (allowAnyOrigin || !origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`Origin not allowed: ${origin}`));
  };

  const db = new LedNodeDatabase(options.dbPath);
  const osc = new OscService();
  const app = express();
  app.set("trust proxy", 1);
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowOrigin,
      credentials: true
    }
  });

  const timers: TimerState = new Map();
  let status: ServerStatus = {
    osc: "connecting",
    lastOscOkAt: null
  };

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 25 * 1024 * 1024
    }
  });

  function getConfig() {
    return db.getConfig();
  }

  function queueState() {
    const config = getConfig();
    const items = db.listQueueItems(config.queueOrdering).map((item) => {
      if (!item.photoAssetId) {
        return item;
      }

      const photo = db.getPhotoAsset(item.photoAssetId);
      if (!photo || !photo.localThumbnailPath || !photo.localDisplayPath) {
        return item;
      }

      return {
        ...item,
        photoThumbnailUrl: `/assets/thumbnails/${path.basename(photo.localThumbnailPath)}`,
        photoDisplayUrl: `/assets/processed/${path.basename(photo.localDisplayPath)}`
      };
    });

    return {
      items,
      activeItemId: db.getLiveItem()?.id ?? null
    };
  }

  function emitFullState(): void {
    io.emit("queue:full_state", queueState());
  }

  function emitServerStatus(): void {
    io.emit("server:status", status);
  }

  function emitConfigUpdated(): void {
    io.emit("config:updated", PublicConfigSchema.parse(getConfig()));
  }

  function setOscHealthy(): void {
    status = {
      osc: "connected",
      lastOscOkAt: new Date().toISOString()
    };
    emitServerStatus();
  }

  function setOscDegraded(): void {
    status = {
      ...status,
      osc: "degraded"
    };
    emitServerStatus();
  }

  async function sendOsc(pathValue: string, value: string | number): Promise<void> {
    const config = getConfig();
    try {
      await osc.send(config.oscHost, config.oscPort, pathValue, value);
      setOscHealthy();
    } catch (error) {
      setOscDegraded();
      throw error;
    }
  }

  async function clearLiveOutput(item: QueueItem): Promise<void> {
    const config = getConfig();

    if (item.activeTextClip) {
      if (item.activeTextClip !== config.textClearClip) {
        const textOffPath = `/composition/layers/${config.textLayer}/clips/${item.activeTextClip}/connect`;
        await sendOsc(textOffPath, 0);
      }
    }
    const textClearPath = `/composition/layers/${config.textLayer}/clips/${config.textClearClip}/connect`;
    await sendOsc(textClearPath, 1);

    const hasPhoto = item.activePhotoClip !== null || item.photoAssetId !== null;
    if (hasPhoto) {
      if (item.activePhotoClip && item.activePhotoClip !== config.photoClearClip) {
        const photoOffPath = `/composition/layers/${config.photoLayer}/clips/${item.activePhotoClip}/connect`;
        await sendOsc(photoOffPath, 0);
      }
      const photoClearPath = `/composition/layers/${config.photoLayer}/clips/${config.photoClearClip}/connect`;
      await sendOsc(photoClearPath, 1);
    }
  }

  function clearTimer(itemId: string): void {
    const timer = timers.get(itemId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(itemId);
    }
  }

  function scheduleAutoExpire(item: QueueItem): void {
    if (!item.expiresAt) {
      return;
    }

    clearTimer(item.id);
    const expiresAtMs = new Date(item.expiresAt).getTime();
    const delay = Math.max(0, expiresAtMs - Date.now());

    const timeout = setTimeout(async () => {
      timers.delete(item.id);
      const liveNow = db.getQueueItem(item.id);
      if (!liveNow || liveNow.status !== "live") {
        return;
      }

      try {
        await clearLiveOutput(liveNow);
      } catch {
        // Keep state transition even if clear call fails.
      }

      db.markQueueItemStatus(item.id, "expired");
      io.emit("queue:item_expired", { id: item.id });
      emitFullState();
    }, delay);

    timers.set(item.id, timeout);
  }

  function ensureStorage(): void {
    const config = getConfig();
    fs.mkdirSync(config.uploadsDir, { recursive: true });
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
    fs.mkdirSync(THUMBNAILS_DIR, { recursive: true });
    fs.mkdirSync(config.resolumeWatchDir, { recursive: true });
  }

  ensureStorage();

  const restoreLive = db.getLiveItem();
  if (restoreLive) {
    scheduleAutoExpire(restoreLive);
  }

  app.use(
    cors({
      origin: allowOrigin,
      credentials: true
    })
  );

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      const forwardedFor = req.headers["x-forwarded-for"];
      const firstForwarded =
        typeof forwardedFor === "string" ? forwardedFor.split(",")[0]?.trim() : undefined;
      const ip = firstForwarded ?? req.socket.remoteAddress ?? "unknown";
      console.info(`[HTTP] ${ip} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
    });
    next();
  });

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(
    session({
      secret: process.env.SESSION_SECRET ?? "lednode-local-dev-secret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: getConfig().sessionDurationMinutes * 60 * 1000
      }
    })
  );

  app.use("/assets/processed", express.static(PROCESSED_DIR));
  app.use("/assets/thumbnails", express.static(THUMBNAILS_DIR));

  function requireStaff(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.authenticated) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  }

  function requireVj(req: Request, res: Response, next: NextFunction): void {
    if (!req.session.authenticated) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!req.session.vjUnlocked) {
      res.status(403).json({ error: "VJ unlock required" });
      return;
    }

    next();
  }

  app.get("/api/config/public", (_req, res) => {
    res.json(PublicConfigSchema.parse(getConfig()));
  });

  app.post("/api/auth/pin", (req, res) => {
    const parsed = PinInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid PIN payload" });
      return;
    }

    const config = getConfig();
    if (parsed.data.pin !== config.pin) {
      res.status(401).json({ error: "Invalid PIN" });
      return;
    }

    req.session.authenticated = true;
    req.session.vjUnlocked = false;
    req.session.cookie.maxAge = config.sessionDurationMinutes * 60 * 1000;

    res.json({ authenticated: true });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ authenticated: false });
    });
  });

  app.get("/api/auth/session", (req, res) => {
    res.json({ authenticated: Boolean(req.session.authenticated) });
  });

  app.post("/api/auth/vj-unlock", requireStaff, (req, res) => {
    const parsed = PinInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid PIN payload" });
      return;
    }

    const config = getConfig();
    if (parsed.data.pin !== config.vjPin) {
      req.session.vjUnlocked = false;
      res.status(401).json({ error: "Invalid VJ PIN" });
      return;
    }

    req.session.vjUnlocked = true;
    res.json({ unlocked: true });
  });

  app.get("/api/auth/vj-session", requireStaff, (req, res) => {
    res.json({ unlocked: Boolean(req.session.vjUnlocked) });
  });

  app.post("/api/auth/vj-lock", requireStaff, (req, res) => {
    req.session.vjUnlocked = false;
    res.json({ unlocked: false });
  });

  app.get("/api/settings", requireVj, (_req, res) => {
    const settings = getConfig();
    const { pin, vjPin, uploadsDir, resolumeWatchDir, ...editable } = settings;
    res.json({ ...editable, uploadsDir, resolumeWatchDir });
  });

  app.patch("/api/settings", requireVj, (req, res) => {
    const parsed = UpdateSettingsInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const updated = db.updateConfig(parsed.data);
    req.session.cookie.maxAge = updated.sessionDurationMinutes * 60 * 1000;

    emitConfigUpdated();
    emitFullState();
    res.json({ ok: true });
  });

  app.get("/api/queue", requireStaff, (_req, res) => {
    res.json(queueState());
  });

  app.post("/api/queue", requireStaff, (req, res) => {
    const parsed = CreateQueueItemInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const created = db.createQueueItem(parsed.data);
    io.emit("queue:item_created", created);
    emitFullState();
    res.status(201).json(created);
  });

  app.patch("/api/queue/:id", requireStaff, (req, res) => {
    const parsed = UpdateQueueItemInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const itemId = routeId(req);
    const existing = db.getQueueItem(itemId);
    if (!existing) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (existing.status !== "queued") {
      res.status(409).json({ error: "Only queued items can be edited" });
      return;
    }

    const updated = db.updateQueueItem(itemId, parsed.data);
    if (!updated) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    io.emit("queue:item_updated", updated);
    emitFullState();
    res.json(updated);
  });

  app.delete("/api/queue/:id", requireStaff, (req, res) => {
    const itemId = routeId(req);
    const existing = db.getQueueItem(itemId);
    if (!existing) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (existing.status !== "queued") {
      res.status(409).json({ error: "Only queued items can be deleted" });
      return;
    }

    db.markQueueItemStatus(existing.id, "deleted");
    io.emit("queue:item_deleted", { id: existing.id });
    emitFullState();
    res.json({ ok: true });
  });

  app.post("/api/queue/clear-all", requireVj, async (_req, res) => {
    const live = db.getLiveItem();
    if (live) {
      clearTimer(live.id);
      try {
        await clearLiveOutput(live);
      } catch {
        // continue clear-all even if osc clear fails
      }
      db.markQueueItemStatus(live.id, "canceled");
      io.emit("queue:item_canceled", { id: live.id });
    }

    const items = db.listQueueItems(getConfig().queueOrdering);
    for (const item of items) {
      if (item.status === "queued") {
        db.markQueueItemStatus(item.id, "deleted");
        io.emit("queue:item_deleted", { id: item.id });
      }
    }

    emitFullState();
    res.json({ ok: true });
  });

  app.post("/api/queue/:id/send", requireStaff, async (req, res) => {
    const item = db.getQueueItem(routeId(req));
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (item.status !== "queued") {
      res.status(409).json({ error: "Only queued items can be sent" });
      return;
    }

    const live = db.getLiveItem();
    if (live) {
      res.status(409).json({ error: "Another item is already live" });
      return;
    }

    const config = getConfig();
    const slot = nextSlot(db.getLastSlot(), config.textStartSlot, config.textClipCount);
    const slotOffset = slot - config.textStartSlot;
    const textClip = slot;
    const photoClip = item.photoAssetId ? config.photoStartSlot + slotOffset : null;

    try {
      const wrapped = wrapMessage(item.message, config.lineWrapChars);
      const textPath = `/composition/layers/${config.textLayer}/clips/${textClip}/video/source/textgenerator/text/params/lines`;
      const textConnectPath = `/composition/layers/${config.textLayer}/clips/${textClip}/connect`;

      await sendOsc(textPath, wrapped);
      await sleep(config.oscTextDelayMs);
      await sendOsc(textConnectPath, 1);

      if (item.photoAssetId) {
        const photo = db.getPhotoAsset(item.photoAssetId);
        if (!photo || (!photo.localOriginalPath && !photo.localDisplayPath)) {
          throw new Error("Photo asset not found for queued item");
        }

        await publishPhotoToWatchFolder({
          photo,
          watchDir: config.resolumeWatchDir,
          slot,
          tileCanvasWidth: config.tileCanvasWidth,
          tileCanvasHeight: config.tileCanvasHeight
        });

        if (photoClip) {
          const photoPath = `/composition/layers/${config.photoLayer}/clips/${photoClip}/connect`;
          await sendOsc(photoPath, 1);
        }
      }

      const expiresAt = new Date(Date.now() + config.autoClearAfterMs).toISOString();
      const liveUpdated = db.markQueueItemLive(item.id, {
        slot,
        textClip,
        photoClip,
        expiresAt
      });

      if (!liveUpdated) {
        throw new Error("Could not update queue state to live");
      }

      db.setLastSlot(slot);
      scheduleAutoExpire(liveUpdated);

      io.emit("queue:item_live", liveUpdated);
      emitFullState();
      res.json(liveUpdated);
    } catch (error) {
      db.markQueueItemStatus(item.id, "failed");
      io.emit("queue:item_updated", db.getQueueItem(item.id));
      emitFullState();
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.post("/api/queue/:id/cancel", requireStaff, async (req, res) => {
    const item = db.getQueueItem(routeId(req));
    if (!item) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    if (item.status !== "live") {
      res.status(409).json({ error: "Only live items can be canceled" });
      return;
    }

    clearTimer(item.id);
    try {
      await clearLiveOutput(item);
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
      return;
    }

    db.markQueueItemStatus(item.id, "canceled");
    io.emit("queue:item_canceled", { id: item.id });
    emitFullState();
    res.json({ ok: true });
  });

  app.post("/api/uploads/photo", requireStaff, upload.single("photo"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "Missing file" });
      return;
    }

    const config = getConfig();

    if (req.file.size > config.maxUploadSizeBytes) {
      res.status(413).json({ error: "File too large" });
      return;
    }

    if (!isAllowedImageMime(req.file.mimetype)) {
      res.status(415).json({ error: "Unsupported file type" });
      return;
    }

    try {
      const processed = await processPhotoUpload({
        uploadsDir: config.uploadsDir,
        processedDir: PROCESSED_DIR,
        thumbnailsDir: THUMBNAILS_DIR,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer,
        sizeBytes: req.file.size,
        tileCanvasWidth: config.tileCanvasWidth,
        tileCanvasHeight: config.tileCanvasHeight
      });

      const created = db.createPhotoAsset(processed);
      const thumbUrl = `/assets/thumbnails/${path.basename(processed.localThumbnailPath)}`;
      const displayUrl = `/assets/processed/${path.basename(processed.localDisplayPath)}`;

      res.status(201).json({
        ...created,
        thumbnailUrl: thumbUrl,
        displayUrl
      });
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.delete("/api/uploads/photo/:id", requireStaff, async (req, res) => {
    const deleted = db.deletePhotoAsset(routeId(req));
    if (!deleted) {
      res.status(404).json({ error: "Photo not found" });
      return;
    }

    const files = [deleted.localOriginalPath, deleted.localDisplayPath, deleted.localThumbnailPath].filter(
      (value): value is string => Boolean(value)
    );

    await Promise.all(
      files.map(async (filePath) => {
        try {
          await fsp.unlink(filePath);
        } catch {
          // ignore deletion issues for already-missing files
        }
      })
    );

    emitFullState();
    res.json({ ok: true });
  });

  app.get("/api/health", async (_req, res) => {
    const config = getConfig();

    let uploadsWritable = true;
    try {
      await fsp.access(config.uploadsDir, fs.constants.W_OK);
    } catch {
      uploadsWritable = false;
    }

    res.json({
      ok: true,
      server: "up",
      db: "reachable",
      uploadsWritable,
      osc: status.osc,
      lastOscOkAt: status.lastOscOkAt
    });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    res.status(500).json({ error: asErrorMessage(error) });
  });

  io.on("connection", (socket) => {
    socket.emit("queue:full_state", queueState() satisfies SocketEvents["queue:full_state"]);
    socket.emit("server:status", status satisfies SocketEvents["server:status"]);
    socket.emit("config:updated", PublicConfigSchema.parse(getConfig()));
  });

  const close = async (): Promise<void> => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();

    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });

    if (httpServer.listening) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }

    db.close();
  };

  return {
    app,
    httpServer,
    io,
    close
  };
}
