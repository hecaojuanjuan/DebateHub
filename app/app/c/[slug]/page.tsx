import CommunityPageView, {
  type LanguageSearch,
} from "@/components/community-page";
export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: LanguageSearch;
}) {
  const { slug } = await params;
  return <CommunityPageView communityId={slug} searchParams={searchParams} />;
}
