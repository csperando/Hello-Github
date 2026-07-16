import { Pool } from "pg";
import { config } from "./config";

const pool = new Pool({
    host: config.POSTGRESS_HOST,
    port: Number(config.POSTGRESS_PORT) || 5432,
    user: config.POSTGRES_USER,
    password: config.POSTGRES_PASSWORD,
    database: config.POSTGRES_DATABASE,
});

export default pool;
