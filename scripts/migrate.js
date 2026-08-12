import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { createDatabaseClient } from "../lib/db/client.js";

const client = createDatabaseClient();

try {
  await migrate(drizzle({ client }), {
    migrationsFolder: "drizzle",
    migrationsSchema: "drizzle",
    migrationsTable: "__drizzle_migrations__",
  });
  console.log("[db] migrations applied");
} finally {
  await client.close();
}
