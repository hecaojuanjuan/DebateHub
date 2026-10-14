export type Side = "pro" | "con";
export type Member = {
  id: string;
  nickname: string;
  role: "owner" | "admin" | "member";
  createdAt: number;
};
export type CommunityLink = {
  id: string;
  name: string;
  role: "owner" | "admin" | "member";
};
export type Community = {
  id: string;
  name: string;
  description: string;
  visibility: "private" | "public";
  memberCount: number;
};
export type Topic = {
  id: string;
  title: string;
  description: string;
  proLabel: string;
  conLabel: string;
  category: string;
  status: "open" | "closed";
  createdAt: number;
  voteCount: number;
  commentCount: number;
};
export type Comment = {
  id: string;
  parentId: string | null;
  userId: string;
  nickname: string;
  side: Side;
  content: string;
  deleted: number;
  createdAt: number;
};
export type State = {
  community: Community;
  viewer: {
    id: string;
    nickname: string;
    role: string | null;
    platformAdmin: boolean;
  } | null;
  accessible: boolean;
  topics: Topic[];
  topic: Topic | null;
  comments: Comment[];
  stats: { pro: number; con: number };
  mySide: Side | null;
};
