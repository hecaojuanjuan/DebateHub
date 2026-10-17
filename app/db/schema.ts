import {
  integer,
  sqliteTable,
  text,
  primaryKey,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const communities = sqliteTable("communities", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  visibility: text("visibility").notNull().default("private"),
  joinApproval: integer("join_approval").notNull().default(0),
  revision: integer("revision").notNull().default(0),
  memberCount: integer("member_count").notNull().default(0),
  pendingCount: integer("pending_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  platformAdmin: integer("platform_admin").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const memberships = sqliteTable(
  "memberships",
  {
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull().default("member"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.userId] }),
    uniqueIndex("one_owner_per_community")
      .on(t.communityId)
      .where(sql`${t.role} = 'owner'`),
  ],
);
export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});
export const membershipRequests = sqliteTable(
  "membership_requests",
  {
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull(),
    createdAt: integer("created_at").notNull(),
    reviewedAt: integer("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => users.id),
  },
  (t) => [
    primaryKey({ columns: [t.communityId, t.userId] }),
    index("membership_requests_status_idx").on(t.communityId, t.status),
  ],
);
export const accountCredentials = sqliteTable("account_credentials", {
  username: text("username").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  passwordHash: text("password_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});
export const accountSetupTokens = sqliteTable("account_setup_tokens", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});
export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    proLabel: text("pro_label").notNull(),
    conLabel: text("con_label").notNull(),
    category: text("category").notNull(),
    status: text("status").notNull().default("open"),
    withdrawn: integer("withdrawn").notNull().default(0),
    updatedAt: integer("updated_at"),
    proCount: integer("pro_count").notNull().default(0),
    conCount: integer("con_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("topics_community_idx").on(t.communityId, t.createdAt)],
);
export const votes = sqliteTable(
  "votes",
  {
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    side: text("side").notNull(),
    anonymous: integer("anonymous").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.topicId, t.userId] })],
);
export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    parentId: text("parent_id"),
    side: text("side").notNull(),
    content: text("content").notNull(),
    anonymous: integer("anonymous").notNull().default(0),
    deleted: integer("deleted").notNull().default(0),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("comments_topic_idx").on(t.topicId, t.createdAt)],
);
export const invites = sqliteTable("invites", {
  tokenHash: text("token_hash").primaryKey(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id),
  expiresAt: integer("expires_at").notNull(),
  revoked: integer("revoked").notNull().default(0),
  createdAt: integer("created_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
});
