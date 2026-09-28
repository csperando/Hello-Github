import { Pool, PoolClient, types } from "pg";
import { config } from "./config";

// pg's default type parser turns DATE columns (OID 1082) into JS Date
// objects (at local-server midnight), which then JSON-serializes as a full
// ISO timestamp - not the plain YYYY-MM-DD string every DATE column in this
// app (start_date/end_date/recurrence_end_date) is modeled as everywhere
// else (models, validation, the Vue frontend). Return the raw string as-is
// instead, so a DATE column is a DATE column end-to-end.
types.setTypeParser(1082, (value: string) => value);

// pg's default type parser returns BIGINT/BIGSERIAL (OID 20) as a string,
// to avoid silent precision loss past Number.MAX_SAFE_INTEGER - but every
// bigserial id in this app (eo_bmf.id, user_profiles.default_charity) is
// modeled as a number everywhere else (models, validation, the Vue
// frontend) and will never get remotely close to that limit.
types.setTypeParser(20, (value: string) => Number(value));

const pool = new Pool({
    host: config.POSTGRES_HOST,
    port: Number(config.POSTGRES_PORT) || 5432,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    database: config.POSTGRES_DATABASE,
});

/**
 * Runs `fn` against a single checked-out client inside a BEGIN/COMMIT
 * transaction: every query `fn` issues via that client either all commit
 * together or all roll back together. On any error from `fn` (or from the
 * COMMIT itself), the transaction is rolled back and the error is rethrown -
 * callers should let it propagate rather than swallow it, unless they mean
 * to treat a specific expected failure (e.g. a unique-violation) as a clean
 * outcome. The client is always released back to the pool.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;

    } catch (err) {
        await client.query("ROLLBACK");
        throw err;

    } finally {
        client.release();
    }
}

export default pool;
