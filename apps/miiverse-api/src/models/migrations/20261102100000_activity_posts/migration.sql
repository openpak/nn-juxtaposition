-- CreateTable
CREATE TABLE "activity_settings" (
    "account_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_settings_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "activity_posts" (
    "id" SERIAL NOT NULL,
    "event_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "image" TEXT NOT NULL DEFAULT '',
    "digest" BOOLEAN NOT NULL DEFAULT false,
    "folded" BOOLEAN NOT NULL DEFAULT false,
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_posts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_posts_event_id_key" ON "activity_posts"("event_id");

-- CreateIndex
CREATE INDEX "activity_posts_account_id_created_at_idx" ON "activity_posts"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_posts_created_at_idx" ON "activity_posts"("created_at");
