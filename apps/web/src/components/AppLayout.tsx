import {
  clearStoredApiKey,
  importApiKeyFromHash,
  loadStoredApiKey,
  saveStoredApiKey,
} from "@/lib/auth-session";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useConsoleLocale } from "./LocaleProvider";
import { ApprovalInbox } from "./ApprovalInbox";
import { Button } from "./ui/Button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { copy, toggleLocale } = useConsoleLocale();
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const saved = window.localStorage.getItem("darkMode");
    return saved ? JSON.parse(saved) : false;
  });
  const [apiKeyInput, setApiKeyInput] = useState(
    () => loadStoredApiKey() ?? "",
  );
  const [storedApiKey, setStoredApiKey] = useState(
    () => loadStoredApiKey() ?? "",
  );
  const [sessionState, setSessionState] = useState<
    "configured" | "missing" | "saved" | "cleared"
  >(() => (loadStoredApiKey() ? "configured" : "missing"));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const importedApiKey = importApiKeyFromHash(window.location.hash);
    if (!importedApiKey) {
      return;
    }

    setStoredApiKey(importedApiKey);
    setApiKeyInput(importedApiKey);
    setSessionState("saved");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );
    void queryClient.invalidateQueries();
  }, [queryClient]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    window.localStorage.setItem("darkMode", JSON.stringify(darkMode));
  }, [darkMode]);

  const navItems = [
    { path: "/agents", label: copy.layout.nav.agents },
    { path: "/agent-tasks", label: copy.layout.nav.agentTasks },
    { path: "/runs", label: copy.layout.nav.runs },
    { path: "/tasks/new", label: copy.layout.nav.submitTask },
    { path: "/health", label: copy.layout.nav.health },
  ];

  const sessionMessage = (() => {
    switch (sessionState) {
      case "configured":
        return copy.layout.sessionConfigured;
      case "saved":
        return copy.layout.sessionSaved;
      case "cleared":
        return copy.layout.sessionCleared;
      default:
        return copy.layout.sessionMissing;
    }
  })();

  const handleSaveApiKey = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const savedApiKey = saveStoredApiKey(apiKeyInput) ?? "";
    setStoredApiKey(savedApiKey);
    setApiKeyInput(savedApiKey);
    setSessionState(savedApiKey ? "saved" : "cleared");
    void queryClient.invalidateQueries();
  };

  const handleClearApiKey = () => {
    clearStoredApiKey();
    setStoredApiKey("");
    setApiKeyInput("");
    setSessionState("cleared");
    void queryClient.resetQueries();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto flex flex-col gap-4 px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <Link to="/" className="text-xl font-bold">
                {copy.layout.brand}
              </Link>
              <nav className="flex gap-4">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`text-sm font-medium transition-colors hover:text-primary ${
                      location.pathname === item.path ||
                      (
                        item.path !== "/" &&
                          location.pathname.startsWith(item.path)
                      )
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <ApprovalInbox hasApiKey={Boolean(storedApiKey)} />
              <button
                type="button"
                onClick={toggleLocale}
                className="rounded-md px-3 py-2 text-sm font-medium hover:bg-accent"
                aria-label={copy.layout.localeToggle}
              >
                {copy.layout.localeToggle}
              </button>
              <button
                type="button"
                onClick={() => setDarkMode(!darkMode)}
                className="rounded-md p-2 hover:bg-accent"
                aria-label={
                  darkMode
                    ? copy.layout.lightModeLabel
                    : copy.layout.darkModeLabel
                }
              >
                {darkMode ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <title>{copy.layout.lightModeLabel}</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <title>{copy.layout.darkModeLabel}</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <form
            onSubmit={handleSaveApiKey}
            className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-sm md:flex-row md:items-center"
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="gateway-api-key" className="font-medium">
                {copy.layout.apiKeyLabel}
              </label>
              <div className="mt-1 flex flex-col gap-2 md:flex-row">
                <input
                  id="gateway-api-key"
                  type="password"
                  value={apiKeyInput}
                  onChange={(event) => setApiKeyInput(event.target.value)}
                  placeholder={copy.layout.apiKeyPlaceholder}
                  className="h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  autoComplete="off"
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm">
                    {copy.layout.saveKey}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleClearApiKey}
                    disabled={!storedApiKey}
                  >
                    {copy.layout.clearKey}
                  </Button>
                </div>
              </div>
            </div>
            <div className="max-w-md text-xs text-muted-foreground">
              <div className="font-medium text-foreground">
                {storedApiKey
                  ? copy.layout.statusConfigured
                  : copy.layout.statusMissing}
              </div>
              <p className="mt-1">{sessionMessage}</p>
            </div>
          </form>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
