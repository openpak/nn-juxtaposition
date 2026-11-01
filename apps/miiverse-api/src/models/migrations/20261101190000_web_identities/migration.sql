-- CreateTable
CREATE TABLE "web_identities" (
    "account_id" TEXT NOT NULL,
    "pid" SERIAL NOT NULL,
    "linked" BOOLEAN NOT NULL DEFAULT false,
    "rules_accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "web_identities_pkey" PRIMARY KEY ("account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "web_identities_pid_key" ON "web_identities"("pid");

-- Web-only accounts count up from 1800000001. nn-account never issues a PID above 1799999999,
-- so these numbers cannot meet a real console PID; the top is the largest 32-bit integer
-- (users.pid is an INTEGER).
ALTER SEQUENCE "web_identities_pid_seq" MINVALUE 1800000001 START WITH 1800000001 RESTART WITH 1800000001 MAXVALUE 2147483647 NO CYCLE;
