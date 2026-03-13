import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLedNodeApp } from "../app.js";

let dbPath: string;
let close: (() => Promise<void>) | null = null;
let app: ReturnType<typeof createLedNodeApp>["app"];

beforeEach(async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lednode-test-"));
  dbPath = path.join(tempDir, "test.db");
  process.env.APP_PIN = "1213";
  process.env.VJ_PIN = "6969";
  const created = createLedNodeApp({ dbPath });
  app = created.app;
  close = created.close;
});

afterEach(async () => {
  if (close) {
    await close();
    close = null;
  }
});

describe("LED NODE API", () => {
  it("authenticates staff and supports queue create/list", async () => {
    const agent = request.agent(app);

    const unauthorized = await agent.get("/api/queue");
    expect(unauthorized.status).toBe(401);

    const login = await agent.post("/api/auth/pin").send({ pin: "1213" });
    expect(login.status).toBe(200);

    const created = await agent.post("/api/queue").send({ tableNumber: "7", message: "WHERE IS HUNTER" });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("queued");

    const list = await agent.get("/api/queue");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
  });

  it("protects settings behind vj unlock", async () => {
    const agent = request.agent(app);

    await agent.post("/api/auth/pin").send({ pin: "1213" });

    const blocked = await agent.patch("/api/settings").send({ lineWrapChars: 20 });
    expect(blocked.status).toBe(403);

    const unlock = await agent.post("/api/auth/vj-unlock").send({ pin: "6969" });
    expect(unlock.status).toBe(200);

    const updated = await agent.patch("/api/settings").send({ lineWrapChars: 20 });
    expect(updated.status).toBe(200);
  });

  it("allows multiple device sessions concurrently", async () => {
    const deviceA = request.agent(app);
    const deviceB = request.agent(app);

    const loginA = await deviceA.post("/api/auth/pin").send({ pin: "1213" });
    const loginB = await deviceB.post("/api/auth/pin").send({ pin: "1213" });
    expect(loginA.status).toBe(200);
    expect(loginB.status).toBe(200);

    const sessionA = await deviceA.get("/api/auth/session");
    const sessionB = await deviceB.get("/api/auth/session");
    expect(sessionA.body.authenticated).toBe(true);
    expect(sessionB.body.authenticated).toBe(true);

    await deviceA.post("/api/auth/logout");

    const sessionAAfter = await deviceA.get("/api/auth/session");
    const sessionBAfter = await deviceB.get("/api/auth/session");
    expect(sessionAAfter.body.authenticated).toBe(false);
    expect(sessionBAfter.body.authenticated).toBe(true);
  });
});
