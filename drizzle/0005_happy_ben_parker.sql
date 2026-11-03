CREATE TABLE "channel_audit_logs" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"log_channel_id" text NOT NULL,
	"set_by" text NOT NULL,
	"set_at" bigint DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint NOT NULL
);
