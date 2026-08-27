CREATE TABLE "trivia_streaks" (
	"user_id" text PRIMARY KEY NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL
);
