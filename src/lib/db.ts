import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import config from "@/config";
import * as schema from "@/db/schema";

const client = postgres(config.DATABASE_URL);

const db = drizzle(client, { schema });

export default db;
