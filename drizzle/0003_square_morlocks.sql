CREATE TABLE "channel_posting_gate_acceptances" (
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"accepted_at" bigint DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint NOT NULL,
	CONSTRAINT "channel_posting_gate_acceptances_pkey" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channel_posting_gates" (
	"channel_id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"prompt" text NOT NULL,
	"phrase" text,
	"generation" text NOT NULL,
	"set_by" text NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"set_at" bigint DEFAULT EXTRACT(EPOCH FROM CURRENT_TIMESTAMP)::bigint NOT NULL,
	CONSTRAINT "channel_posting_gates_mode_check" CHECK ("channel_posting_gates"."mode" IN ('button', 'phrase')),
	CONSTRAINT "channel_posting_gates_phrase_check" CHECK (("channel_posting_gates"."mode" = 'button' AND "channel_posting_gates"."phrase" IS NULL) OR ("channel_posting_gates"."mode" = 'phrase' AND "channel_posting_gates"."phrase" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "channel_posting_gate_acceptances" ADD CONSTRAINT "channel_posting_gate_acceptances_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "public"."channel_posting_gates"("channel_id") ON DELETE cascade ON UPDATE no action;