import { describe, expect, it } from "vitest";
import { EN_CONSOLE_COPY } from "../src/lib/locale-copy-en";
import { ZH_CN_CONSOLE_COPY } from "../src/lib/locale-copy-zh-cn";
import {
  CONSOLE_LOCALE_STORAGE_KEY,
  type LocaleStorageLike,
  getConsoleCopy,
  loadStoredLocale,
  normalizeLocale,
  saveStoredLocale,
} from "../src/lib/locale";

class MemoryStorage implements LocaleStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("console locale helpers", () => {
  it("normalizes unknown locales back to English", () => {
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeLocale("fr")).toBe("en");
    expect(normalizeLocale(undefined)).toBe("en");
  });

  it("stores and loads the selected locale", () => {
    const storage = new MemoryStorage();

    expect(loadStoredLocale(storage)).toBe("en");

    saveStoredLocale("zh-CN", storage);
    expect(storage.getItem(CONSOLE_LOCALE_STORAGE_KEY)).toBe("zh-CN");
    expect(loadStoredLocale(storage)).toBe("zh-CN");
  });

  it("exposes translated navigation and action labels", () => {
    expect(getConsoleCopy("en").layout.localeToggle).toBe("\u4e2d\u6587");
    expect(getConsoleCopy("en").layout.nav.agents).toBe("Agents");
    expect(getConsoleCopy("zh-CN").layout.localeToggle).toBe("EN");
    expect(getConsoleCopy("zh-CN").layout.nav.agents).toBe(
      "\u667a\u80fd\u4f53",
    );
    expect(getConsoleCopy("zh-CN").agents.create).toBe(
      "\u521b\u5efa\u667a\u80fd\u4f53",
    );
  });

  it("maps each locale to its dedicated copy module", () => {
    expect(getConsoleCopy("en")).toBe(EN_CONSOLE_COPY);
    expect(getConsoleCopy("zh-CN")).toBe(ZH_CN_CONSOLE_COPY);
  });
});
