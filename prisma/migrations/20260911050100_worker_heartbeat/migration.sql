CREATE TABLE "worker_heartbeats" (
  "name" TEXT NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("name")
);
