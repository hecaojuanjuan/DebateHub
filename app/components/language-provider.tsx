"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  communityDescription,
  communityName,
  isLocale,
  languageCookie,
  languageStorage,
  localeTag,
  resolveLocale,
  translate,
  type Locale,
} from "@/lib/i18n/core";
import { translateError } from "@/lib/i18n/errors";
import type { MessageKey } from "@/lib/i18n/messages";

type LanguageContext = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  errorText: (message: string) => string;
  formatTime: (value: number) => string;
  formatDate: (value: number) => string;
  communityName: (name: string | undefined, id: string) => string;
  communityDescription: (description: string, id: string) => string;
};
const Context = createContext<LanguageContext | null>(null);

export function LanguageProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(languageStorage);
    } catch {
      /* Storage can be disabled. */
    }
    const cookie = document.cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${languageCookie}=`))
      ?.split("=")[1];
    updateLocale(
      resolveLocale({
        query: new URL(location.href).searchParams.get("lang"),
        cookie,
        stored,
        languages: navigator.languages.join(","),
      }),
    );
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = localeTag(locale);
    document.cookie = `${languageCookie}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    try {
      localStorage.setItem(languageStorage, locale);
    } catch {
      /* The in-memory choice still works. */
    }
  }, [locale, ready]);
  const setLocale = useCallback((next: Locale) => {
    if (!isLocale(next)) return;
    updateLocale(next);
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, []);
  const value = useMemo<LanguageContext>(() => {
    const date = new Intl.DateTimeFormat(localeTag(locale), {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Shanghai",
    });
    const time = new Intl.DateTimeFormat(localeTag(locale), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Shanghai",
    });
    return {
      locale,
      setLocale,
      t: (key, values) => translate(locale, key, values),
      errorText: (message) => translateError(message, locale),
      formatTime: (value) => time.format(value),
      formatDate: (value) => date.format(value),
      communityName: (name, id) => communityName(name, id, locale),
      communityDescription: (description, id) =>
        communityDescription(description, id, locale),
    };
  }, [locale, setLocale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLanguage() {
  const value = useContext(Context);
  if (!value) throw new Error("LanguageProvider is required");
  return value;
}

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useLanguage();
  return (
    <div
      className="language-switch"
      role="group"
      aria-label={t("Interface language")}
    >
      <button
        type="button"
        lang="zh-CN"
        aria-pressed={locale === "zh"}
        onClick={() => setLocale("zh")}
        title="切换到中文 / Switch to Chinese"
      >
        中文
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
        title="Switch to English / 切换到英文"
      >
        EN
      </button>
    </div>
  );
}
