import { messages, type MessageKey } from "./messages";

export type Locale = "zh" | "en";
export const languageCookie = "debate_language";
export const languageStorage = "debatehub.language";
export const localeTag = (locale: Locale) =>
  locale === "en" ? "en-US" : "zh-CN";
export function isLocale(value: unknown): value is Locale {
  return value === "zh" || value === "en";
}
export function preferredLocale(language: string | null | undefined): Locale {
  const candidates = (language || "")
    .split(",")
    .map((item, index) => {
      const [tag, quality] = item.trim().split(";");
      return {
        tag: tag.toLowerCase(),
        quality: quality ? Number(quality.replace(/^q=/, "")) : 1,
        index,
      };
    })
    .filter((item) => item.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  for (const { tag } of candidates) {
    if (/^en(?:-|$)/.test(tag)) return "en";
    if (/^zh(?:-|$)/.test(tag)) return "zh";
  }
  return "zh";
}
export function resolveLocale(options: {
  query?: unknown;
  cookie?: unknown;
  stored?: unknown;
  languages?: string | null;
}): Locale {
  for (const candidate of [options.query, options.cookie, options.stored]) {
    if (isLocale(candidate)) return candidate;
  }
  return preferredLocale(options.languages);
}
export function translate(
  locale: Locale,
  key: MessageKey,
  values: Record<string, string | number> = {},
) {
  const template = locale === "en" ? key : messages[key];
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
    const value = values[name];
    return value === undefined
      ? placeholder
      : typeof value === "number"
        ? new Intl.NumberFormat(localeTag(locale)).format(value)
        : value;
  });
}
export function localizedUrl(value: string, locale: Locale) {
  const url = new URL(value);
  url.searchParams.set("lang", locale);
  return url.href;
}
export function communityName(
  name: string | undefined,
  id: string,
  locale: Locale,
) {
  if (id === "unnc" && (!name || name === messages["UNNC Debate"]))
    return translate(locale, "UNNC Debate");
  return name || translate(locale, "Community space");
}
export function communityDescription(
  description: string,
  id: string,
  locale: Locale,
) {
  const key =
    "A debate community at the University of Nottingham Ningbo China. One motion a week to exchange ideas and broaden how we think.";
  return id === "unnc" && description === messages[key]
    ? translate(locale, key)
    : description;
}

const translatedByChinese = new Map<string, MessageKey>(
  Object.entries(messages).map(([en, zh]) => [zh, en as MessageKey]),
);
export function systemMessageKey(value: string): MessageKey | undefined {
  if (Object.hasOwn(messages, value)) return value as MessageKey;
  return translatedByChinese.get(value);
}
