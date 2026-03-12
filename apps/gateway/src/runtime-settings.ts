import {
  readRuntimeSettings,
  type RuntimeSettings,
  writeRuntimeSettings,
} from "@senclaw/config";

export interface RuntimeSettingsStore {
  get(): RuntimeSettings;
  update(next: Partial<RuntimeSettings>): RuntimeSettings;
}

export function createRuntimeSettingsStore(
  settingsFile: string,
): RuntimeSettingsStore {
  return {
    get() {
      return readRuntimeSettings(settingsFile);
    },
    update(next) {
      return writeRuntimeSettings(settingsFile, next);
    },
  };
}
