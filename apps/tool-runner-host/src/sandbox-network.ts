export function normalizeHostname(
  hostname: string | undefined,
): string | undefined {
  if (typeof hostname !== "string" || hostname.length === 0) {
    return undefined;
  }

  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

export function parseUrlHostname(value: unknown): string | undefined {
  try {
    return normalizeHostname(new URL(String(value)).hostname);
  } catch {
    return undefined;
  }
}

export function extractHostname(
  primary: unknown,
  secondary?: unknown,
): string | undefined {
  if (primary instanceof URL) {
    return normalizeHostname(primary.hostname);
  }

  if (typeof primary === "string") {
    if (primary.includes("://")) {
      return parseUrlHostname(primary);
    }

    return typeof secondary === "string"
      ? normalizeHostname(secondary)
      : undefined;
  }

  if (typeof primary === "number") {
    return typeof secondary === "string"
      ? normalizeHostname(secondary)
      : undefined;
  }

  if (primary && typeof primary === "object") {
    const value = primary as {
      hostname?: unknown;
      host?: unknown;
      href?: unknown;
    };

    if (typeof value.hostname === "string") {
      return normalizeHostname(value.hostname);
    }

    if (typeof value.host === "string") {
      const host = value.host.includes("://")
        ? parseUrlHostname(value.host)
        : normalizeHostname(value.host.split(":")[0]);
      if (host) {
        return host;
      }
    }

    if (typeof value.href === "string") {
      return parseUrlHostname(value.href);
    }
  }

  return undefined;
}

export function createNetworkAccessController(
  allowNetwork: boolean,
  allowedDomains: string[],
): (hostname: string | undefined) => void {
  const normalizedAllowedDomains = allowedDomains.map((domain) =>
    domain.toLowerCase(),
  );

  return (hostname) => {
    if (!allowNetwork) {
      throw new Error("Network access is disabled for this tool");
    }

    if (normalizedAllowedDomains.length === 0) {
      return;
    }

    const normalizedHostname = normalizeHostname(hostname);
    if (
      !normalizedHostname ||
      !normalizedAllowedDomains.includes(normalizedHostname)
    ) {
      throw new Error(
        `Network access denied: ${normalizedHostname ?? "unknown-host"}`,
      );
    }
  };
}

export const NETWORK_POLICY_SOURCE = String.raw`
const normalizeHostname = (hostname) => {
  if (typeof hostname !== "string" || hostname.length === 0) {
    return undefined;
  }

  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
};

const parseUrlHostname = (value) => {
  try {
    return normalizeHostname(new URL(value.toString()).hostname);
  } catch {
    return undefined;
  }
};

const extractHostname = (primary, secondary) => {
  if (primary instanceof URL) {
    return normalizeHostname(primary.hostname);
  }

  if (typeof primary === "string") {
    if (primary.includes("://")) {
      return parseUrlHostname(primary);
    }

    return typeof secondary === "string" ? normalizeHostname(secondary) : undefined;
  }

  if (typeof primary === "number") {
    return typeof secondary === "string" ? normalizeHostname(secondary) : undefined;
  }

  if (primary && typeof primary === "object") {
    if (typeof primary.hostname === "string") {
      return normalizeHostname(primary.hostname);
    }

    if (typeof primary.host === "string") {
      const host = primary.host.includes("://")
        ? parseUrlHostname(primary.host)
        : normalizeHostname(primary.host.split(":")[0]);
      if (host) {
        return host;
      }
    }

    if (typeof primary.href === "string") {
      return parseUrlHostname(primary.href);
    }
  }

  return undefined;
};

const createNetworkGuard = (allowNetwork, allowedDomains) => {
  const normalizedAllowedDomains = allowedDomains.map((domain) => domain.toLowerCase());

  return (hostname) => {
    if (!allowNetwork) {
      throw new Error("Network access is disabled for this tool");
    }

    if (normalizedAllowedDomains.length === 0) {
      return;
    }

    const normalizedHostname = normalizeHostname(hostname);
    if (!normalizedHostname || !normalizedAllowedDomains.includes(normalizedHostname)) {
      throw new Error("Network access denied: " + (normalizedHostname ?? "unknown-host"));
    }
  };
};

const patchFetch = (ensureNetworkAccess) => {
  if (typeof globalThis.fetch !== "function") {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const requestUrl =
      typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const hostname = new URL(requestUrl).hostname;
    ensureNetworkAccess(hostname);
    return originalFetch(input, init);
  };
};

const patchHttpModule = (moduleRef, originals, ensureNetworkAccess) => {
  const guardMethod = (originalMethod) => (input, ...args) => {
    ensureNetworkAccess(extractHostname(input, args[0]));
    return originalMethod(input, ...args);
  };

  moduleRef.request = guardMethod(originals.request);
  moduleRef.get = guardMethod(originals.get);
};

const patchSocketConnectors = (ensureNetworkAccess) => {
  net.connect = (primary, secondary, ...args) => {
    ensureNetworkAccess(extractHostname(primary, secondary));
    return originalNet.connect(primary, secondary, ...args);
  };

  net.createConnection = (primary, secondary, ...args) => {
    ensureNetworkAccess(extractHostname(primary, secondary));
    return originalNet.createConnection(primary, secondary, ...args);
  };

  tls.connect = (primary, secondary, ...args) => {
    ensureNetworkAccess(extractHostname(primary, secondary));
    return originalTls.connect(primary, secondary, ...args);
  };
};

const configureNetwork = (allowNetwork, allowedDomains) => {
  const ensureNetworkAccess = createNetworkGuard(allowNetwork, allowedDomains);
  patchFetch(ensureNetworkAccess);
  patchHttpModule(http, originalHttp, ensureNetworkAccess);
  patchHttpModule(https, originalHttps, ensureNetworkAccess);
  patchSocketConnectors(ensureNetworkAccess);
  syncBuiltinESMExports();
};
`;
