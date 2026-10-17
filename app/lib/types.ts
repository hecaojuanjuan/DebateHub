export type Side = "pro" | "con";
export type Member = {
  id: string;
  nickname: string;
  role: "owner" | "admin" | "member";
  createdAt: number;
};
export type JoinRequest = { id: string; nickname: string; createdAt: number };
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
  joinApproval: boolean;
};
export type Topic = {
  id: string;
  title: string;
  description: string;
  proLabel: string;
  conLabel: string;
  category: string;
  status: "open" | "closed";
  withdrawn: boolean;
  updatedAt: number | null;
  createdAt: number;
  voteCount: number;
  commentCount: number;
};
export type Comment = {
  id: string;
  parentId: string | null;
  userId: string | null;
  anonymous: boolean;
  isMine: boolean;
  nickname: string;
  side: Side;
  content: string;
  deleted: number;
  createdAt: number;
};
export type State = {
  community: Community;
  pendingCount: number;
  viewer: {
    id: string;
    nickname: string;
    role: string | null;
    platformAdmin: boolean;
    username: string | null;
    joinStatus: "pending" | "rejected" | "removed" | null;
  } | null;
  accessible: boolean;
  topics: Topic[];
  topic: Topic | null;
  comments: Comment[];
  voters: {
    userId: string | null;
    nickname: string;
    side: Side;
    anonymous: boolean;
    isMine: boolean;
  }[];
  stats: { pro: number; con: number };
  mySide: Side | null;
  myVoteAnonymous: boolean;
};
