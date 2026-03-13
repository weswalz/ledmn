import type { PublicConfig, QueueItem } from "@lednode/shared";

export type QueueStateResponse = {
  items: QueueItem[];
  activeItemId: string | null;
};

export type UploadResponse = {
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
  createdAt: string;
  attachedToQueueItemId: string | null;
  thumbnailUrl: string;
  displayUrl: string;
};

export type ServerStatus = {
  osc: "connected" | "connecting" | "disconnected" | "degraded";
  lastOscOkAt: string | null;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.error ?? message;
    } catch {
      // ignore parsing failure
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function apiBase(): string {
  if (process.env.NEXT_PUBLIC_API_BASE) {
    return process.env.NEXT_PUBLIC_API_BASE;
  }

  return "";
}

export function socketBase(): string {
  if (process.env.NEXT_PUBLIC_SOCKET_BASE) {
    return process.env.NEXT_PUBLIC_SOCKET_BASE;
  }

  return "";
}

export function withApiBase(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${apiBase()}${path}`;
}

export const api = {
  getSession: () => call<{ authenticated: boolean }>("/api/auth/session"),
  login: (pin: string) => call<{ authenticated: boolean }>("/api/auth/pin", { method: "POST", body: JSON.stringify({ pin }) }),
  logout: () => call<{ authenticated: boolean }>("/api/auth/logout", { method: "POST" }),
  getVjSession: () => call<{ unlocked: boolean }>("/api/auth/vj-session"),
  unlockVj: (pin: string) => call<{ unlocked: boolean }>("/api/auth/vj-unlock", { method: "POST", body: JSON.stringify({ pin }) }),
  lockVj: () => call<{ unlocked: boolean }>("/api/auth/vj-lock", { method: "POST" }),
  getPublicConfig: () => call<PublicConfig>("/api/config/public"),
  getSettings: () => call<Record<string, unknown>>("/api/settings"),
  patchSettings: (patch: Record<string, unknown>) =>
    call<{ ok: true }>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),
  getQueue: () => call<QueueStateResponse>("/api/queue"),
  createQueueItem: (payload: { tableNumber: string; message: string; photoAssetId?: string | null }) =>
    call<QueueItem>("/api/queue", { method: "POST", body: JSON.stringify(payload) }),
  updateQueueItem: (id: string, payload: { tableNumber?: string; message?: string; photoAssetId?: string | null }) =>
    call<QueueItem>(`/api/queue/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteQueueItem: (id: string) => call<{ ok: true }>(`/api/queue/${id}`, { method: "DELETE" }),
  sendQueueItem: (id: string) => call<QueueItem>(`/api/queue/${id}/send`, { method: "POST" }),
  cancelQueueItem: (id: string) => call<{ ok: true }>(`/api/queue/${id}/cancel`, { method: "POST" }),
  clearAll: () => call<{ ok: true }>("/api/queue/clear-all", { method: "POST" }),
  async uploadPhoto(file: File): Promise<UploadResponse> {
    const form = new FormData();
    form.set("photo", file);

    const response = await fetch(`${apiBase()}/api/uploads/photo`, {
      method: "POST",
      body: form,
      credentials: "include"
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Upload failed (${response.status})`);
    }

    return response.json() as Promise<UploadResponse>;
  },
  deletePhoto: (id: string) => call<{ ok: true }>(`/api/uploads/photo/${id}`, { method: "DELETE" })
};
