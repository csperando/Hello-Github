import * as dotenv from "dotenv";
import assert from "assert";

// TODO - review
dotenv.config();

const {
    REST_NODE_ENV,
    REST_PORT,
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DATABASE,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
} = process.env;

assert(REST_NODE_ENV, "[REST_NODE_ENV] is required.");
assert(REST_PORT, "[REST_PORT] is required.");
assert(POSTGRES_HOST, "[POSTGRES_HOST] is required.");
assert(POSTGRES_PORT, "[POSTGRES_PORT] is required.");
assert(POSTGRES_DATABASE, "[POSTGRES_DATABASE] is required.");
assert(POSTGRES_USER, "[POSTGRES_USER] is required.");
assert(POSTGRES_PASSWORD, "[POSTGRES_PASSWORD] is required.");

export interface iConfig {
    REST_NODE_ENV: string;
    REST_PORT: number | string;
    POSTGRES_HOST: string;
    POSTGRES_PORT: number | string;
    POSTGRES_DATABASE: string;
    POSTGRES_USER: string;
    POSTGRES_PASSWORD: string;
};

export const config: iConfig = {
    REST_NODE_ENV: REST_NODE_ENV,
    REST_PORT: REST_PORT,
    POSTGRES_HOST: POSTGRES_HOST,
    POSTGRES_PORT: POSTGRES_PORT,
    POSTGRES_DATABASE: POSTGRES_DATABASE,
    POSTGRES_USER: POSTGRES_USER,
    POSTGRES_PASSWORD: POSTGRES_PASSWORD,
};
