"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PublicConfig, QueueItem } from "@lednode/shared";
import { io, type Socket } from "socket.io-client";
import {
  api,
  socketBase,
  type QueueStateResponse,
  type ServerStatus,
  type UploadResponse,
  withApiBase
} from "../src/lib/api";

type DraftState = {
  tableNumber: string;
  message: string;
  photo: UploadResponse | null;
};

type SettingsDraft = {
  oscHost: string;
  oscPort: number;
  textLayer: number;
  textStartSlot: number;
  textClipCount: number;
  textClearClip: number;
  photoLayer: number;
  photoStartSlot: number;
  photoClipCount: number;
  photoClearClip: number;
  tileCanvasWidth: number;
  tileCanvasHeight: number;
  oscTextDelayMs: number;
  autoClearAfterMs: number;
  queueOrdering: "newest" | "oldest";
  sessionDurationMinutes: number;
  lineWrapChars: number;
  maxUploadSizeBytes: number;
  uploadsDir: string;
  resolumeWatchDir: string;
};

const defaultDraft: DraftState = {
  tableNumber: "",
  message: "",
  photo: null
};

export default function Page() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);

  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [publicConfig, setPublicConfig] = useState<PublicConfig | null>(null);
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ osc: "connecting", lastOscOkAt: null });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [showEditor, setShowEditor] = useState(false);
  const [editingItem, setEditingItem] = useState<QueueItem | null>(null);
  const [draft, setDraft] = useState<DraftState>(defaultDraft);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [vjUnlocked, setVjUnlocked] = useState(false);
  const [vjPin, setVjPin] = useState("");
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const liveCountDowns = useMemo(() => {
    if (nowMs === null) {
      return {};
    }

    const map: Record<string, string> = {};
    for (const item of queueItems) {
      if (!item.expiresAt) {
        continue;
      }
      const remain = Math.max(0, new Date(item.expiresAt).getTime() - nowMs);
      const seconds = Math.floor(remain / 1000);
      map[item.id] = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }
    return map;
  }, [queueItems, nowMs]);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const refreshAll = useCallback(async () => {
    const [queue, config] = await Promise.all([api.getQueue(), api.getPublicConfig()]);
    setQueueItems(queue.items);
    setActiveItemId(queue.activeItemId);
    setPublicConfig(config);
  }, []);

  async function bootstrap() {
    try {
      const [session, config] = await Promise.all([api.getSession(), api.getPublicConfig()]);
      setPublicConfig(config);
      setAuthenticated(session.authenticated);
      if (session.authenticated) {
        await refreshAll();
        const vj = await api.getVjSession().catch(() => ({ unlocked: false }));
        setVjUnlocked(vj.unlocked);
      }
    } catch (error) {
      setAuthenticated(false);
      setGlobalError((error as Error).message);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshAll().catch(() => {
        // Keep UI usable if polling refresh fails transiently.
      });
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [authenticated, refreshAll]);

  useEffect(() => {
    if (!authenticated) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(socketBase(), {
      withCredentials: true,
      transports: ["websocket", "polling"]
    });

    socket.on("queue:full_state", (state: QueueStateResponse) => {
      setQueueItems(state.items);
      setActiveItemId(state.activeItemId);
    });

    socket.on("server:status", (statusPayload: ServerStatus) => {
      setServerStatus(statusPayload);
    });

    socket.on("config:updated", (configPayload: PublicConfig) => {
      setPublicConfig(configPayload);
    });

    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [authenticated]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setAuthError(null);
    try {
      await api.login(pin);
      setPin("");
      setAuthenticated(true);
      await refreshAll();
    } catch (error) {
      setAuthError((error as Error).message);
      setPin("");
    }
  }

  async function handleLogout() {
    await api.logout();
    setAuthenticated(false);
    setVjUnlocked(false);
    setShowSettings(false);
    setQueueItems([]);
  }

  function openCreateModal() {
    setEditingItem(null);
    setDraft(defaultDraft);
    setShowEditor(true);
    setGlobalError(null);
  }

  function openEditModal(item: QueueItem) {
    setEditingItem(item);
    setDraft({
      tableNumber: item.tableNumber,
      message: item.message,
      photo: item.photoAssetId
        ? {
            id: item.photoAssetId,
            originalFilename: "",
            storageFilename: "",
            mimeType: "image/jpeg",
            sizeBytes: 0,
            width: null,
            height: null,
            localOriginalPath: "",
            localDisplayPath: "",
            localThumbnailPath: "",
            createdAt: "",
            attachedToQueueItemId: item.id,
            thumbnailUrl: item.photoThumbnailUrl ?? "",
            displayUrl: item.photoDisplayUrl ?? ""
          }
        : null
    });
    setShowEditor(true);
    setGlobalError(null);
  }

  async function saveMessage(event: FormEvent) {
    event.preventDefault();

    if (!draft.message.trim()) {
      setGlobalError("Message is required");
      return;
    }

    setGlobalError(null);

    try {
      if (editingItem) {
        await api.updateQueueItem(editingItem.id, {
          tableNumber: draft.tableNumber,
          message: draft.message,
          photoAssetId: draft.photo?.id ?? null
        });
      } else {
        await api.createQueueItem({
          tableNumber: draft.tableNumber,
          message: draft.message,
          photoAssetId: draft.photo?.id ?? null
        });
      }

      await refreshAll();
      setShowEditor(false);
      setDraft(defaultDraft);
    } catch (error) {
      setGlobalError((error as Error).message);
    }
  }

  async function sendItem(itemId: string) {
    setBusyId(itemId);
    setGlobalError(null);
    try {
      await api.sendQueueItem(itemId);
      await refreshAll();
    } catch (error) {
      setGlobalError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function cancelItem(itemId: string) {
    setBusyId(itemId);
    setGlobalError(null);
    try {
      await api.cancelQueueItem(itemId);
      await refreshAll();
    } catch (error) {
      setGlobalError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(itemId: string) {
    setBusyId(itemId);
    setGlobalError(null);
    try {
      await api.deleteQueueItem(itemId);
      await refreshAll();
      if (editingItem?.id === itemId) {
        setShowEditor(false);
      }
    } catch (error) {
      setGlobalError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function clearWall() {
    setBusyId("clear-all");
    setGlobalError(null);
    try {
      await api.clearAll();
      await refreshAll();
    } catch (error) {
      setGlobalError((error as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onUploadFile(file: File) {
    setUploadingPhoto(true);
    setGlobalError(null);
    try {
      const uploaded = await api.uploadPhoto(file);
      setDraft((current) => ({ ...current, photo: uploaded }));
    } catch (error) {
      setGlobalError((error as Error).message);
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  }

  async function removePhoto() {
    if (!draft.photo?.id) {
      return;
    }

    try {
      await api.deletePhoto(draft.photo.id);
      setDraft((current) => ({ ...current, photo: null }));
    } catch (error) {
      setGlobalError((error as Error).message);
    }
  }

  async function openSettings() {
    setShowSettings(true);
    setSettingsError(null);

    try {
      const vj = await api.getVjSession();
      setVjUnlocked(vj.unlocked);
      if (vj.unlocked) {
        const settings = (await api.getSettings()) as SettingsDraft;
        setSettingsDraft(settings);
      }
    } catch {
      setVjUnlocked(false);
    }
  }

  async function unlockVj(event: FormEvent) {
    event.preventDefault();
    setSettingsError(null);

    try {
      await api.unlockVj(vjPin);
      setVjPin("");
      setVjUnlocked(true);
      const settings = (await api.getSettings()) as SettingsDraft;
      setSettingsDraft(settings);
    } catch (error) {
      setSettingsError((error as Error).message);
      setVjUnlocked(false);
    }
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!settingsDraft) {
      return;
    }

    setSettingsError(null);

    try {
      await api.patchSettings(settingsDraft);
      setShowSettings(false);
      const config = await api.getPublicConfig();
      setPublicConfig(config);
    } catch (error) {
      setSettingsError((error as Error).message);
    }
  }

  if (authenticated === null) {
    return (
      <main className="login-shell">
        <img className="login-brand" src="/led-messenger-logo.png" alt="LED MESSENGER" />
        <p className="small-text">Loading LED MESSENGER...</p>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main className="login-shell">
        <form className="login-card" onSubmit={handleLogin}>
          <img className="login-brand" src="/led-messenger-logo.png" alt="LED MESSENGER" />
          <p className="small-text">Enter staff PIN to access queue controls.</p>
          <label className="field-label" htmlFor="staff-pin">
            Staff PIN
          </label>
          <input
            id="staff-pin"
            className="field"
            inputMode="numeric"
            maxLength={4}
            type="password"
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            required
          />
          {authError ? <div className="error">{authError}</div> : null}
          <div className="button-row">
            <button className="btn btn-primary" type="submit">
              Unlock
            </button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="top-bar">
        <div className="brand-wrap">
          <img className="brand-logo" src="/led-messenger-logo.png" alt="LED MESSENGER" />
        </div>
        <div className="header-controls">
          <div className="status-pill">
            <span className={`dot ${serverStatus.osc}`} />
            {serverStatus.osc}
          </div>
          <button type="button" className="logout-chip" onClick={() => void handleLogout()}>
            Logout
          </button>
          <button type="button" className="gear-btn" onClick={() => void openSettings()}>
            ⚙
          </button>
        </div>
      </header>

      {globalError ? <div className="error">{globalError}</div> : null}

      <section className="queue-list">
        {queueItems.map((item) => {
          const isLive = item.id === activeItemId || item.status === "live";
          return (
            <article key={item.id} className={`card ${isLive ? "live" : ""}`}>
              <div className="table-label">TABLE {item.tableNumber}</div>
              <div className="message-text">{item.message}</div>

              {item.photoThumbnailUrl ? (
                <img className="thumb" src={withApiBase(item.photoThumbnailUrl)} alt="Queue item preview" />
              ) : null}

              {isLive ? (
                <div className="small-text" style={{ marginTop: 8 }}>
                  LIVE {liveCountDowns[item.id] ? ` · ${liveCountDowns[item.id]}` : ""}
                </div>
              ) : null}

              {isLive ? (
                <div className="card-actions card-actions-live">
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={() => void cancelItem(item.id)}
                    disabled={busyId === item.id}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="card-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void sendItem(item.id)}
                    disabled={busyId === item.id || Boolean(activeItemId)}
                  >
                    Send to Wall
                  </button>
                  <button className="btn btn-outline" type="button" onClick={() => openEditModal(item)}>
                    Edit
                  </button>
                  <button className="btn btn-danger" type="button" onClick={() => void deleteItem(item.id)}>
                    Delete
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>

      <div className="footer-actions">
        <button className="btn btn-outline" type="button" onClick={() => void clearWall()} disabled={busyId === "clear-all"}>
          Clear
        </button>
        <button className="btn btn-primary" type="button" onClick={openCreateModal}>
          + New Message
        </button>
      </div>

      {showEditor ? (
        <div className="modal-backdrop">
          <form className="modal-panel" onSubmit={saveMessage}>
            <h2 className="modal-title">{editingItem ? "Edit Message" : "New Message"}</h2>
            <p className="small-text" style={{ textAlign: "center" }}>
              Create message labels for organization
            </p>

            <div style={{ marginTop: 14 }}>
              <label className="field-label" htmlFor="table-number">
                Table Number
              </label>
              <input
                id="table-number"
                className="field"
                value={draft.tableNumber}
                onChange={(event) => setDraft((current) => ({ ...current, tableNumber: event.target.value }))}
                placeholder="Enter table number"
                required
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <label className="field-label" htmlFor="message-value">
                Message
              </label>
              <textarea
                id="message-value"
                className="field"
                value={draft.message}
                onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))}
                placeholder="Enter your message"
                required
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="field-label">Photo (Optional)</div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/heic,image/heif"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onUploadFile(file);
                  }
                }}
              />

              {!draft.photo ? (
                <button
                  type="button"
                  className="photo-drop"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? "Uploading..." : "Add Photo\nOptional image attachment"}
                </button>
              ) : (
                <div className="photo-drop">
                  {draft.photo.thumbnailUrl ? (
                    <img className="thumb" src={withApiBase(draft.photo.thumbnailUrl)} alt="Uploaded preview" />
                  ) : null}
                  <div className="button-row">
                    <button className="btn btn-outline" type="button" onClick={() => fileRef.current?.click()}>
                      Replace
                    </button>
                    <button className="btn btn-danger" type="button" onClick={() => void removePhoto()}>
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="button-row" style={{ marginTop: 18 }}>
              <button
                className="btn btn-danger"
                type="button"
                onClick={() => {
                  setShowEditor(false);
                  setDraft(defaultDraft);
                }}
              >
                Cancel
              </button>
              <button className="btn btn-primary" type="submit" disabled={uploadingPhoto}>
                {editingItem ? "Save Changes" : "Add Message"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {showSettings ? (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <h2 className="modal-title">Settings</h2>

            {!vjUnlocked ? (
              <form onSubmit={unlockVj}>
                <p className="small-text">Enter VJ PIN to unlock runtime configuration.</p>
                <input
                  className="field"
                  inputMode="numeric"
                  maxLength={4}
                  type="password"
                  value={vjPin}
                  onChange={(event) => setVjPin(event.target.value.replace(/\D/g, ""))}
                  required
                />
                {settingsError ? <div className="error">{settingsError}</div> : null}
                <div className="button-row" style={{ marginTop: 14 }}>
                  <button className="btn btn-danger" type="button" onClick={() => setShowSettings(false)}>
                    Close
                  </button>
                  <button className="btn btn-primary" type="submit">
                    Unlock
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={saveSettings}>
                {settingsDraft ? (
                  <>
                    <p className="small-text">VJ unlocked. Configure OSC + clip mapping + timers.</p>
                    <div className="settings-grid">
                      <Field label="OSC Host" value={settingsDraft.oscHost} onChange={(value) => setSettingsDraft({ ...settingsDraft, oscHost: value })} />
                      <NumberField
                        label="OSC Port"
                        value={settingsDraft.oscPort}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, oscPort: value })}
                      />
                      <NumberField
                        label="Text Layer"
                        value={settingsDraft.textLayer}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, textLayer: value })}
                      />
                      <NumberField
                        label="Text Start Slot"
                        value={settingsDraft.textStartSlot}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, textStartSlot: value })}
                      />
                      <NumberField
                        label="Text Clip Count"
                        value={settingsDraft.textClipCount}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, textClipCount: value })}
                      />
                      <NumberField
                        label="Text Clear Slot (Cancel/Expire)"
                        value={settingsDraft.textClearClip}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, textClearClip: value })}
                      />
                      <NumberField
                        label="Photo Layer"
                        value={settingsDraft.photoLayer}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, photoLayer: value })}
                      />
                      <NumberField
                        label="Photo Start Slot"
                        value={settingsDraft.photoStartSlot}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, photoStartSlot: value })}
                      />
                      <NumberField
                        label="Photo Clip Count"
                        value={settingsDraft.photoClipCount}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, photoClipCount: value })}
                      />
                      <NumberField
                        label="Photo Clear Slot"
                        value={settingsDraft.photoClearClip}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, photoClearClip: value })}
                      />
                      <NumberField
                        label="Tile Canvas Width"
                        value={settingsDraft.tileCanvasWidth}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, tileCanvasWidth: value })}
                      />
                      <NumberField
                        label="Tile Canvas Height"
                        value={settingsDraft.tileCanvasHeight}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, tileCanvasHeight: value })}
                      />
                      <NumberField
                        label="Text Delay (ms)"
                        value={settingsDraft.oscTextDelayMs}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, oscTextDelayMs: value })}
                      />
                      <NumberField
                        label="Auto Clear (ms)"
                        value={settingsDraft.autoClearAfterMs}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, autoClearAfterMs: value })}
                      />
                      <NumberField
                        label="Session Minutes"
                        value={settingsDraft.sessionDurationMinutes}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, sessionDurationMinutes: value })}
                      />
                      <NumberField
                        label="Line Wrap Chars"
                        value={settingsDraft.lineWrapChars}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, lineWrapChars: value })}
                      />
                      <NumberField
                        label="Max Upload Bytes"
                        value={settingsDraft.maxUploadSizeBytes}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, maxUploadSizeBytes: value })}
                      />
                      <Field
                        label="Uploads Dir"
                        value={settingsDraft.uploadsDir}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, uploadsDir: value })}
                      />
                      <Field
                        label="Resolume Watch Dir"
                        value={settingsDraft.resolumeWatchDir}
                        onChange={(value) => setSettingsDraft({ ...settingsDraft, resolumeWatchDir: value })}
                      />
                      <label className="field-label" style={{ marginTop: 4 }}>
                        Queue Ordering
                        <select
                          className="field"
                          value={settingsDraft.queueOrdering}
                          onChange={(event) =>
                            setSettingsDraft({
                              ...settingsDraft,
                              queueOrdering: event.target.value as "newest" | "oldest"
                            })
                          }
                        >
                          <option value="newest">Newest First</option>
                          <option value="oldest">Oldest First</option>
                        </select>
                      </label>
                    </div>
                  </>
                ) : (
                  <p className="small-text">Loading settings...</p>
                )}

                {settingsError ? <div className="error">{settingsError}</div> : null}

                <div className="button-row" style={{ marginTop: 14 }}>
                  <button
                    className="btn btn-danger"
                    type="button"
                    onClick={async () => {
                      await api.lockVj();
                      setShowSettings(false);
                      setVjUnlocked(false);
                    }}
                  >
                    Lock + Close
                  </button>
                  <button className="btn btn-primary" type="submit" disabled={!settingsDraft}>
                    Save Settings
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field-label" style={{ marginTop: 4 }}>
      {label}
      <input className="field" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field-label" style={{ marginTop: 4 }}>
      {label}
      <input
        className="field"
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
      />
    </label>
  );
}
