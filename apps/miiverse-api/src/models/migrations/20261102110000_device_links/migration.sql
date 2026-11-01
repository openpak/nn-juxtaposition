-- CreateTable
CREATE TABLE "device_links" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "device_class" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "device_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_links_token_hash_key" ON "device_links"("token_hash");

-- CreateIndex
CREATE INDEX "device_links_account_id_idx" ON "device_links"("account_id");
