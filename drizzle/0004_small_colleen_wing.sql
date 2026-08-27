CREATE TABLE "trivia_scores" (
	"user_id" text PRIMARY KEY NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"played" integer DEFAULT 0 NOT NULL
);
