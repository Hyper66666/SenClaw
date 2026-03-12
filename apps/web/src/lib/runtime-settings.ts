import { normalizeLocale, type ConsoleLocale } from "./locale";

export async function loadRuntimeLocale(): Promise<ConsoleLocale> {
  const response = await fetch("/api/runtime/settings", {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load runtime locale: ${response.status}`);
  }

  const payload = (await response.json()) as { locale?: string };
  return normalizeLocale(payload.locale);
}

export async function saveRuntimeLocale(
  locale: ConsoleLocale,
): Promise<ConsoleLocale> {
  const response = await fetch("/api/runtime/settings", {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({ locale }),
  });

  if (!response.ok) {
    throw new Error(`Failed to save runtime locale: ${response.status}`);
  }

  const payload = (await response.json()) as { locale?: string };
  return normalizeLocale(payload.locale);
}
