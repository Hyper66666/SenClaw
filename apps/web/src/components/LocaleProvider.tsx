import { createContext, useContext, useEffect, useState } from "react";
import {
  getConsoleCopy,
  loadStoredLocale,
  saveStoredLocale,
  type ConsoleCopy,
  type ConsoleLocale,
} from "@/lib/locale";
import { loadRuntimeLocale, saveRuntimeLocale } from "@/lib/runtime-settings";

interface LocaleContextValue {
  locale: ConsoleLocale;
  copy: ConsoleCopy;
  setLocale(locale: ConsoleLocale): void;
  toggleLocale(): void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<ConsoleLocale>(() =>
    loadStoredLocale(),
  );

  useEffect(() => {
    let cancelled = false;

    void loadRuntimeLocale()
      .then((runtimeLocale) => {
        if (cancelled) {
          return;
        }

        const saved = saveStoredLocale(runtimeLocale);
        setLocaleState(saved);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = (nextLocale: ConsoleLocale) => {
    const saved = saveStoredLocale(nextLocale);
    setLocaleState(saved);
    void saveRuntimeLocale(saved).catch(() => undefined);
  };

  const toggleLocale = () => {
    setLocale(locale === "en" ? "zh-CN" : "en");
  };

  return (
    <LocaleContext.Provider
      value={{
        locale,
        copy: getConsoleCopy(locale),
        setLocale,
        toggleLocale,
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useConsoleLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) {
    throw new Error("useConsoleLocale must be used within LocaleProvider");
  }

  return value;
}
