ALTER TABLE `communities` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `communities` ADD `member_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `communities` ADD `pending_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `pro_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `con_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `topics` ADD `comment_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE topics SET pro_count=(SELECT COUNT(*) FROM votes WHERE topic_id=topics.id AND side='pro'), con_count=(SELECT COUNT(*) FROM votes WHERE topic_id=topics.id AND side='con'), comment_count=(SELECT COUNT(*) FROM comments WHERE topic_id=topics.id AND deleted=0);
--> statement-breakpoint
UPDATE communities SET member_count=(SELECT COUNT(*) FROM memberships WHERE community_id=communities.id), pending_count=(SELECT COUNT(*) FROM membership_requests WHERE community_id=communities.id AND status='pending');
--> statement-breakpoint
CREATE TRIGGER community_settings_revision AFTER UPDATE OF name,description,visibility,join_approval ON communities BEGIN UPDATE communities SET revision=revision+1 WHERE id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER topic_insert_revision AFTER INSERT ON topics BEGIN UPDATE communities SET revision=revision+1 WHERE id=NEW.community_id; END;
--> statement-breakpoint
CREATE TRIGGER topic_update_revision AFTER UPDATE ON topics BEGIN UPDATE communities SET revision=revision+1 WHERE id IN (OLD.community_id,NEW.community_id); END;
--> statement-breakpoint
CREATE TRIGGER topic_delete_revision AFTER DELETE ON topics BEGIN UPDATE communities SET revision=revision+1 WHERE id=OLD.community_id; END;
--> statement-breakpoint
CREATE TRIGGER vote_insert_counts AFTER INSERT ON votes BEGIN UPDATE topics SET pro_count=pro_count+(NEW.side='pro'),con_count=con_count+(NEW.side='con') WHERE id=NEW.topic_id; END;
--> statement-breakpoint
CREATE TRIGGER vote_update_counts AFTER UPDATE ON votes BEGIN UPDATE topics SET pro_count=pro_count-(OLD.side='pro'),con_count=con_count-(OLD.side='con') WHERE id=OLD.topic_id; UPDATE topics SET pro_count=pro_count+(NEW.side='pro'),con_count=con_count+(NEW.side='con') WHERE id=NEW.topic_id; END;
--> statement-breakpoint
CREATE TRIGGER vote_delete_counts AFTER DELETE ON votes BEGIN UPDATE topics SET pro_count=pro_count-(OLD.side='pro'),con_count=con_count-(OLD.side='con') WHERE id=OLD.topic_id; END;
--> statement-breakpoint
CREATE TRIGGER comment_insert_counts AFTER INSERT ON comments BEGIN UPDATE topics SET comment_count=comment_count+(NEW.deleted=0) WHERE id=NEW.topic_id; END;
--> statement-breakpoint
CREATE TRIGGER comment_update_counts AFTER UPDATE ON comments BEGIN UPDATE topics SET comment_count=comment_count-(OLD.deleted=0) WHERE id=OLD.topic_id; UPDATE topics SET comment_count=comment_count+(NEW.deleted=0) WHERE id=NEW.topic_id; END;
--> statement-breakpoint
CREATE TRIGGER comment_delete_counts AFTER DELETE ON comments BEGIN UPDATE topics SET comment_count=comment_count-(OLD.deleted=0) WHERE id=OLD.topic_id; END;
--> statement-breakpoint
CREATE TRIGGER member_insert_counts AFTER INSERT ON memberships BEGIN UPDATE communities SET member_count=member_count+1,revision=revision+1 WHERE id=NEW.community_id; END;
--> statement-breakpoint
CREATE TRIGGER member_update_revision AFTER UPDATE ON memberships BEGIN UPDATE communities SET revision=revision+1 WHERE id IN (OLD.community_id,NEW.community_id); END;
--> statement-breakpoint
CREATE TRIGGER member_delete_counts AFTER DELETE ON memberships BEGIN UPDATE communities SET member_count=member_count-1,revision=revision+1 WHERE id=OLD.community_id; END;
--> statement-breakpoint
CREATE TRIGGER request_insert_counts AFTER INSERT ON membership_requests BEGIN UPDATE communities SET pending_count=pending_count+(NEW.status='pending'),revision=revision+1 WHERE id=NEW.community_id; END;
--> statement-breakpoint
CREATE TRIGGER request_update_counts AFTER UPDATE ON membership_requests BEGIN UPDATE communities SET pending_count=pending_count-(OLD.status='pending')+(NEW.status='pending'),revision=revision+1 WHERE id=NEW.community_id; END;
--> statement-breakpoint
CREATE TRIGGER request_delete_counts AFTER DELETE ON membership_requests BEGIN UPDATE communities SET pending_count=pending_count-(OLD.status='pending'),revision=revision+1 WHERE id=OLD.community_id; END;
--> statement-breakpoint
CREATE TRIGGER user_name_revision AFTER UPDATE OF nickname ON users BEGIN UPDATE communities SET revision=revision+1 WHERE id IN (SELECT community_id FROM memberships WHERE user_id=NEW.id UNION SELECT t.community_id FROM topics t JOIN comments c ON c.topic_id=t.id WHERE c.user_id=NEW.id UNION SELECT t.community_id FROM topics t JOIN votes v ON v.topic_id=t.id WHERE v.user_id=NEW.id); END;
