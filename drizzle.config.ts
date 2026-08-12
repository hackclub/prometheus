import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const databaseUrl = new URL(process.env.DATABASE_URL);
if (databaseUrl.searchParams.get("sslrootcert") === "system") {
  databaseUrl.searchParams.delete("sslrootcert");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl.toString(),
  },
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations__",
  },
});
