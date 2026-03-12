import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";

describe("Gateway runtime settings", () => {
  let app: FastifyInstance;
  let runtimeSettingsPath: string;

  beforeAll(async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "senclaw-runtime-settings-"));
    runtimeSettingsPath = join(tempDir, "runtime-settings.json");

    const server = await createServer({
      runtimeSettingsPath,
    });
    app = server.app;
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    rmSync(dirname(runtimeSettingsPath), { recursive: true, force: true });
  });

  it("returns the default locale when no runtime settings file exists", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/runtime/settings",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      locale: "en",
    });
  });

  it("persists the selected locale for later startup scripts", async () => {
    const putResponse = await app.inject({
      method: "PUT",
      url: "/api/runtime/settings",
      payload: {
        locale: "zh-CN",
      },
    });

    expect(putResponse.statusCode).toBe(200);
    expect(putResponse.json()).toEqual({
      locale: "zh-CN",
    });

    const getResponse = await app.inject({
      method: "GET",
      url: "/api/runtime/settings",
    });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual({
      locale: "zh-CN",
    });
  });
});
