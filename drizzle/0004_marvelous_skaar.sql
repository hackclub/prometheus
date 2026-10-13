CREATE TABLE "channel_deletion_dms" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"set_by" text NOT NULL,
	"set_at" bigint DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint NOT NULL
);
