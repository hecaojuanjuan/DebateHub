import DebateApp from "@/components/debate-app";
export default async function CommunityPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DebateApp communityId={slug} />;
}
