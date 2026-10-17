import CommunityPageView, {
  type LanguageSearch,
} from "@/components/community-page";
export default function Home({
  searchParams,
}: {
  searchParams: LanguageSearch;
}) {
  return <CommunityPageView searchParams={searchParams} />;
}
