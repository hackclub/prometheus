import { SQL } from "bun";

export function createDatabaseClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const max = Number.parseInt(process.env.DATABASE_POOL_SIZE || "4", 10);
  const u = new URL(process.env.DATABASE_URL);
  if (u.searchParams.get("sslrootcert") === "system") {
    u.searchParams.delete("sslrootcert");
  }

  return new SQL({
    url: u.toString(),
    max: Number.isInteger(max) && max > 0 ? max : 4,
    idleTimeout: 30,
    connectionTimeout: 10,
  });
}
