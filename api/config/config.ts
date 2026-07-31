import * as dotenv from "dotenv";
import assert from "assert";

// TODO - review
dotenv.config({ quiet: true });

const {
    REST_NODE_ENV,
    REST_PORT,
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DATABASE,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL,
    SESSION_SECRET,
    FRONTEND_URL,
    SCHEDULER_API_KEY,
} = process.env;

assert(REST_NODE_ENV, "[REST_NODE_ENV] is required.");
assert(REST_PORT, "[REST_PORT] is required.");
assert(POSTGRES_HOST, "[POSTGRES_HOST] is required.");
assert(POSTGRES_PORT, "[POSTGRES_PORT] is required.");
assert(POSTGRES_DATABASE, "[POSTGRES_DATABASE] is required.");
assert(POSTGRES_USER, "[POSTGRES_USER] is required.");
assert(POSTGRES_PASSWORD, "[POSTGRES_PASSWORD] is required.");
assert(GITHUB_CLIENT_ID, "[GITHUB_CLIENT_ID] is required.");
assert(GITHUB_CLIENT_SECRET, "[GITHUB_CLIENT_SECRET] is required.");
assert(GITHUB_CALLBACK_URL, "[GITHUB_CALLBACK_URL] is required.");
assert(SESSION_SECRET, "[SESSION_SECRET] is required.");
assert(FRONTEND_URL, "[FRONTEND_URL] is required.");
assert(SCHEDULER_API_KEY, "[SCHEDULER_API_KEY] is required.");

export interface iConfig {
    REST_NODE_ENV: string;
    REST_PORT: number | string;
    POSTGRES_HOST: string;
    POSTGRES_PORT: number | string;
    POSTGRES_DATABASE: string;
    POSTGRES_USER: string;
    POSTGRES_PASSWORD: string;
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    GITHUB_CALLBACK_URL: string;
    SESSION_SECRET: string;
    FRONTEND_URL: string;
    SCHEDULER_API_KEY: string;
};

export const config: iConfig = {
    REST_NODE_ENV: REST_NODE_ENV,
    REST_PORT: REST_PORT,
    POSTGRES_HOST: POSTGRES_HOST,
    POSTGRES_PORT: POSTGRES_PORT,
    POSTGRES_DATABASE: POSTGRES_DATABASE,
    POSTGRES_USER: POSTGRES_USER,
    POSTGRES_PASSWORD: POSTGRES_PASSWORD,
    GITHUB_CLIENT_ID: GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: GITHUB_CLIENT_SECRET,
    GITHUB_CALLBACK_URL: GITHUB_CALLBACK_URL,
    SESSION_SECRET: SESSION_SECRET,
    FRONTEND_URL: FRONTEND_URL,
    SCHEDULER_API_KEY: SCHEDULER_API_KEY,
};
