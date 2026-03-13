import { z } from "zod";

const OscHostSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/^[^:\s]+:\d+$/.test(value), {
    message: "OSC host must not include a port. Use oscPort separately."
  });

export const QueueItemStatusSchema = z.enum([
  "queued",
  "live",
  "canceled",
  "expired",
  "deleted",
  "failed"
]);

export type QueueItemStatus = z.infer<typeof QueueItemStatusSchema>;

export const QueueOrderingSchema = z.enum(["newest", "oldest"]);

export const QueueItemSchema = z.object({
  id: z.string().uuid(),
  tableNumber: z.string().trim().min(1).max(32),
  message: z.string().trim().min(1).max(1000),
  status: QueueItemStatusSchema,
  photoAssetId: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sentAt: z.string().nullable(),
  activeSlot: z.number().int().nullable(),
  activeTextClip: z.number().int().nullable(),
  activePhotoClip: z.number().int().nullable(),
  expiresAt: z.string().nullable(),
  photoThumbnailUrl: z.string().optional(),
  photoDisplayUrl: z.string().optional()
});

export type QueueItem = z.infer<typeof QueueItemSchema>;

export const PhotoAssetSchema = z.object({
  id: z.string().uuid(),
  originalFilename: z.string(),
  storageFilename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  localOriginalPath: z.string(),
  localDisplayPath: z.string().nullable(),
  localThumbnailPath: z.string().nullable(),
  createdAt: z.string(),
  attachedToQueueItemId: z.string().uuid().nullable()
});

export type PhotoAsset = z.infer<typeof PhotoAssetSchema>;

export const AppConfigSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  vjPin: z.string().regex(/^\d{4}$/),
  oscHost: OscHostSchema,
  oscPort: z.number().int().positive(),
  textLayer: z.number().int().positive(),
  textStartSlot: z.number().int().positive(),
  textClipCount: z.number().int().positive(),
  textClearClip: z.number().int().positive(),
  photoLayer: z.number().int().positive(),
  photoStartSlot: z.number().int().positive(),
  photoClipCount: z.number().int().positive(),
  photoClearClip: z.number().int().positive(),
  tileCanvasWidth: z.number().int().positive(),
  tileCanvasHeight: z.number().int().positive(),
  oscTextDelayMs: z.number().int().nonnegative(),
  autoClearAfterMs: z.number().int().positive(),
  uploadsDir: z.string().min(1),
  resolumeWatchDir: z.string().min(1),
  queueOrdering: QueueOrderingSchema,
  sessionDurationMinutes: z.number().int().positive(),
  lineWrapChars: z.number().int().positive().max(120),
  maxUploadSizeBytes: z.number().int().positive()
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const PublicConfigSchema = AppConfigSchema.omit({
  pin: true,
  vjPin: true,
  uploadsDir: true,
  resolumeWatchDir: true
});

export type PublicConfig = z.infer<typeof PublicConfigSchema>;

export const StaffSessionSchema = z.object({
  authenticated: z.boolean()
});

export type StaffSession = z.infer<typeof StaffSessionSchema>;

export const VjSessionSchema = z.object({
  unlocked: z.boolean()
});

export type VjSession = z.infer<typeof VjSessionSchema>;

export const CreateQueueItemInputSchema = z.object({
  tableNumber: z.string().trim().min(1).max(32),
  message: z.string().trim().min(1).max(1000),
  photoAssetId: z.string().uuid().nullable().optional()
});

export type CreateQueueItemInput = z.infer<typeof CreateQueueItemInputSchema>;

export const UpdateQueueItemInputSchema = z.object({
  tableNumber: z.string().trim().min(1).max(32).optional(),
  message: z.string().trim().min(1).max(1000).optional(),
  photoAssetId: z.string().uuid().nullable().optional()
});

export type UpdateQueueItemInput = z.infer<typeof UpdateQueueItemInputSchema>;

export const PinInputSchema = z.object({
  pin: z.string().regex(/^\d{4}$/)
});

export const UpdateSettingsInputSchema = z.object({
  oscHost: OscHostSchema.optional(),
  oscPort: z.number().int().positive().optional(),
  textLayer: z.number().int().positive().optional(),
  textStartSlot: z.number().int().positive().optional(),
  textClipCount: z.number().int().positive().optional(),
  textClearClip: z.number().int().positive().optional(),
  photoLayer: z.number().int().positive().optional(),
  photoStartSlot: z.number().int().positive().optional(),
  photoClipCount: z.number().int().positive().optional(),
  photoClearClip: z.number().int().positive().optional(),
  tileCanvasWidth: z.number().int().positive().optional(),
  tileCanvasHeight: z.number().int().positive().optional(),
  oscTextDelayMs: z.number().int().nonnegative().optional(),
  autoClearAfterMs: z.number().int().positive().optional(),
  queueOrdering: QueueOrderingSchema.optional(),
  sessionDurationMinutes: z.number().int().positive().optional(),
  lineWrapChars: z.number().int().positive().max(120).optional(),
  maxUploadSizeBytes: z.number().int().positive().optional(),
  uploadsDir: z.string().min(1).optional(),
  resolumeWatchDir: z.string().min(1).optional()
});

export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>;

export type SocketEvents = {
  "queue:full_state": { items: QueueItem[]; activeItemId: string | null };
  "queue:item_created": QueueItem;
  "queue:item_updated": QueueItem;
  "queue:item_deleted": { id: string };
  "queue:item_live": QueueItem;
  "queue:item_canceled": { id: string };
  "queue:item_expired": { id: string };
  "server:status": { osc: "connected" | "connecting" | "disconnected" | "degraded"; lastOscOkAt: string | null };
  "config:updated": PublicConfig;
};

export const DEFAULTS = {
  queueOrdering: "newest",
  autoClearAfterMs: 180000,
  oscTextDelayMs: 200,
  lineWrapChars: 16,
  tileCanvasWidth: 3500,
  tileCanvasHeight: 1080,
  sessionDurationMinutes: 480,
  maxUploadSizeBytes: 10 * 1024 * 1024
} as const;
