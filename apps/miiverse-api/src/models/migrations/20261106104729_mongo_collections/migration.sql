-- CreateEnum
CREATE TYPE "CommunityShotMode" AS ENUM ('allow', 'block', 'force');

-- CreateEnum
CREATE TYPE "AutomodRuleType" AS ENUM ('keyword');

-- CreateEnum
CREATE TYPE "AutomodRuleMode" AS ENUM ('block', 'log');

-- CreateEnum
CREATE TYPE "AutomodAction" AS ENUM ('blocked', 'logged');

-- CreateEnum
CREATE TYPE "AuditLogAction" AS ENUM ('REMOVE_POST', 'IGNORE_REPORT', 'LIMIT_POSTING', 'TEMP_BAN', 'PERMA_BAN', 'UNBAN', 'UPDATE_USER', 'MAKE_COMMUNITY', 'UPDATE_COMMUNITY', 'DELETE_COMMUNITY');

-- CreateTable
CREATE TABLE "communities" (
    "community_id" TEXT NOT NULL,
    "olive_community_id" TEXT NOT NULL,
    "legacy_mongo_id" TEXT,
    "platform_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "open" BOOLEAN NOT NULL DEFAULT true,
    "allows_comments" BOOLEAN NOT NULL DEFAULT true,
    "type" INTEGER NOT NULL DEFAULT 0,
    "parent" TEXT,
    "admins" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "owner" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "empathy_count" INTEGER NOT NULL DEFAULT 0,
    "has_shop_page" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT NOT NULL,
    "ctr_header" TEXT,
    "wup_header" TEXT,
    "icon_path_32" TEXT,
    "icon_path_48" TEXT,
    "icon_path_64" TEXT,
    "icon_path_96" TEXT,
    "icon_path_128" TEXT,
    "title_id" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_recommended" INTEGER NOT NULL DEFAULT 0,
    "app_data" TEXT NOT NULL DEFAULT '',
    "user_favorites" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "permissions_open" BOOLEAN NOT NULL DEFAULT true,
    "minimum_new_post_access_level" INTEGER NOT NULL DEFAULT 0,
    "minimum_new_comment_access_level" INTEGER NOT NULL DEFAULT 0,
    "minimum_new_community_access_level" INTEGER NOT NULL DEFAULT 3,
    "shot_mode" "CommunityShotMode" NOT NULL DEFAULT 'allow',
    "shot_extra_title_id" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "family" BOOLEAN NOT NULL DEFAULT false,
    "art_sha" TEXT,

    CONSTRAINT "communities_pkey" PRIMARY KEY ("community_id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "legacy_mongo_id" TEXT,
    "title_id" TEXT,
    "body" TEXT NOT NULL DEFAULT '',
    "body_markdown" TEXT,
    "app_data" TEXT,
    "painting" TEXT,
    "painting_img" TEXT,
    "painting_big" TEXT,
    "screenshot" TEXT,
    "screenshot_big" TEXT,
    "screenshot_thumb" TEXT,
    "screenshot_length" INTEGER,
    "screenshot_aspect" TEXT,
    "search_key" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topic_tag" TEXT,
    "community_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "feeling_id" INTEGER,
    "is_autopost" INTEGER NOT NULL DEFAULT 0,
    "is_community_private_autopost" INTEGER NOT NULL DEFAULT 0,
    "is_spoiler" INTEGER NOT NULL DEFAULT 0,
    "is_app_jumpable" INTEGER NOT NULL DEFAULT 0,
    "empathy_count" INTEGER NOT NULL DEFAULT 0,
    "country_id" INTEGER NOT NULL DEFAULT 49,
    "language_id" INTEGER NOT NULL DEFAULT 1,
    "pid" INTEGER NOT NULL,
    "platform_id" INTEGER,
    "region_id" INTEGER,
    "parent" TEXT,
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "message_to_pid" TEXT,
    "removed" BOOLEAN NOT NULL DEFAULT false,
    "removed_reason" TEXT,
    "removed_by" INTEGER,
    "removed_at" TIMESTAMP(3),
    "yeahs" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "legacy_mongo_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message_preview" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_users" (
    "conversation_id" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "read" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "conversation_users_pkey" PRIMARY KEY ("conversation_id","pid")
);

-- CreateTable
CREATE TABLE "endpoints" (
    "id" SERIAL NOT NULL,
    "legacy_mongo_id" TEXT,
    "status" INTEGER NOT NULL DEFAULT 0,
    "server_access_level" TEXT NOT NULL,
    "topics" BOOLEAN NOT NULL DEFAULT false,
    "guest_access" BOOLEAN NOT NULL DEFAULT false,
    "new_users" BOOLEAN NOT NULL DEFAULT true,
    "host" TEXT NOT NULL DEFAULT '',
    "api_host" TEXT NOT NULL DEFAULT '',
    "portal_host" TEXT NOT NULL DEFAULT '',
    "n3ds_host" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "legacy_mongo_id" TEXT,
    "pid" INTEGER NOT NULL,
    "reported_by" INTEGER NOT NULL,
    "post_id" TEXT NOT NULL,
    "reason" INTEGER NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "resolved_by" INTEGER,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automod_rules" (
    "id" TEXT NOT NULL,
    "legacy_mongo_id" TEXT,
    "enabled" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "AutomodRuleType" NOT NULL,
    "mode" "AutomodRuleMode" NOT NULL,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "automod_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automod_logs" (
    "id" TEXT NOT NULL,
    "legacy_mongo_id" TEXT,
    "rule_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "author" INTEGER NOT NULL,
    "action" "AutomodAction" NOT NULL,
    "post_id" TEXT,
    "parent_post_id" TEXT,
    "community_id" TEXT,
    "matches" JSONB,
    "post_content_body" TEXT,

    CONSTRAINT "automod_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "legacy_mongo_id" TEXT,
    "actor" INTEGER NOT NULL,
    "action" "AuditLogAction" NOT NULL,
    "target" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changed_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communities_olive_community_id_key" ON "communities"("olive_community_id");

-- CreateIndex
CREATE UNIQUE INDEX "communities_legacy_mongo_id_key" ON "communities"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "communities_parent_type_idx" ON "communities"("parent", "type");

-- CreateIndex
CREATE INDEX "communities_type_created_at_idx" ON "communities"("type", "created_at");

-- CreateIndex
CREATE INDEX "communities_owner_idx" ON "communities"("owner");

-- CreateIndex
CREATE INDEX "communities_title_id_idx" ON "communities" USING GIN ("title_id");

-- CreateIndex
CREATE INDEX "communities_user_favorites_idx" ON "communities" USING GIN ("user_favorites");

-- CreateIndex
CREATE UNIQUE INDEX "posts_legacy_mongo_id_key" ON "posts"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "posts_community_id_removed_parent_created_at_idx" ON "posts"("community_id", "removed", "parent", "created_at" DESC);

-- CreateIndex
CREATE INDEX "posts_parent_removed_created_at_idx" ON "posts"("parent", "removed", "created_at" DESC);

-- CreateIndex
CREATE INDEX "posts_pid_message_to_pid_parent_removed_created_at_idx" ON "posts"("pid", "message_to_pid", "parent", "removed", "created_at" DESC);

-- CreateIndex
CREATE INDEX "posts_topic_tag_message_to_pid_parent_removed_created_at_idx" ON "posts"("topic_tag", "message_to_pid", "parent", "removed", "created_at" DESC);

-- CreateIndex
CREATE INDEX "posts_message_to_pid_created_at_idx" ON "posts"("message_to_pid", "created_at");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");

-- CreateIndex
CREATE INDEX "posts_yeahs_idx" ON "posts" USING GIN ("yeahs");

-- CreateIndex
CREATE INDEX "posts_search_key_idx" ON "posts" USING GIN ("search_key");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_legacy_mongo_id_key" ON "conversations"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "conversation_users_pid_idx" ON "conversation_users"("pid");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_legacy_mongo_id_key" ON "endpoints"("legacy_mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_server_access_level_key" ON "endpoints"("server_access_level");

-- CreateIndex
CREATE UNIQUE INDEX "reports_legacy_mongo_id_key" ON "reports"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "reports_post_id_reported_by_idx" ON "reports"("post_id", "reported_by");

-- CreateIndex
CREATE INDEX "reports_reported_by_idx" ON "reports"("reported_by");

-- CreateIndex
CREATE INDEX "reports_pid_idx" ON "reports"("pid");

-- CreateIndex
CREATE INDEX "reports_created_at_idx" ON "reports"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "automod_rules_legacy_mongo_id_key" ON "automod_rules"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "automod_rules_enabled_idx" ON "automod_rules"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "automod_logs_legacy_mongo_id_key" ON "automod_logs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "automod_logs_author_idx" ON "automod_logs"("author");

-- CreateIndex
CREATE INDEX "automod_logs_action_created_at_idx" ON "automod_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "automod_logs_created_at_idx" ON "automod_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_legacy_mongo_id_key" ON "audit_logs"("legacy_mongo_id");

-- CreateIndex
CREATE INDEX "audit_logs_target_idx" ON "audit_logs"("target");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs"("actor");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- AddForeignKey
ALTER TABLE "conversation_users" ADD CONSTRAINT "conversation_users_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
