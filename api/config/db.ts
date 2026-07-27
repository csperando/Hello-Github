import { Pool, types } from "pg";
import { config } from "./config";

// pg's default type parser turns DATE columns (OID 1082) into JS Date
// objects (at local-server midnight), which then JSON-serializes as a full
// ISO timestamp - not the plain YYYY-MM-DD string every DATE column in this
// app (start_date/end_date/recurrence_end_date) is modeled as everywhere
// else (models, validation, the Vue frontend). Return the raw string as-is
// instead, so a DATE column is a DATE column end-to-end.
types.setTypeParser(1082, (value: string) => value);

const pool = new Pool({
    host: config.POSTGRES_HOST,
    port: Number(config.POSTGRES_PORT) || 5432,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    database: config.POSTGRES_DATABASE,
});

export default pool;
