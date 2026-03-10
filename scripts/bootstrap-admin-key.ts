import { loadConfig } from "@senclaw/config";
import { createStorage } from "@senclaw/storage";
import { ApiKeyService } from "../apps/gateway/src/auth/api-key-service.js";

async function main(): Promise<void> {
  const config = loadConfig();
  if (!config.dbUrl) {
    throw new Error(
      "SENCLAW_DB_URL is required for bootstrap-admin-key so the generated key persists.",
    );
  }

  const storage = createStorage(config.dbUrl);

  try {
    const apiKeyService = new ApiKeyService(storage.apiKeys);
    const bootstrapAdminKey = await apiKeyService.ensureBootstrapAdminKey({
      print: true,
    });

    if (!bootstrapAdminKey) {
      console.log(
        "Bootstrap admin key already exists. No new key was generated.",
      );
    }
  } finally {
    storage.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
