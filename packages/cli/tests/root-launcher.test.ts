import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("root launcher wrapper", () => {
  it("uses its own directory so it can run outside the repo root", () => {
    const script = readFileSync(resolve(process.cwd(), "senclaw.cmd"), "utf8");

    expect(script).toContain("%~dp0");
    expect(script).toContain("packages\\cli\\dist\\index.js");
  });
});
