import DebateApp from "./debate-app";
import { LanguageProvider } from "./language-provider";
import { requestLocale } from "@/lib/i18n/server";

export type LanguageSearch = Promise<{ lang?: string | string[] }>;

export default async function CommunityPageView({
  communityId = "unnc",
  searchParams,
}: {
  communityId?: string;
  searchParams?: LanguageSearch;
}) {
  const locale = await requestLocale((await searchParams)?.lang);
  return (
    <LanguageProvider initialLocale={locale}>
      <DebateApp communityId={communityId} />
    </LanguageProvider>
  );
}
