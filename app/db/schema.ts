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
