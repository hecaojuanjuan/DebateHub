import { cookies, headers } from "next/headers";
import { languageCookie, resolveLocale } from "./core";

export async function requestLocale(query?: unknown) {
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  return resolveLocale({
    query,
    cookie: jar.get(languageCookie)?.value,
    languages: requestHeaders.get("accept-language"),
  });
}
