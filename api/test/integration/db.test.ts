import server from "../server";
import pool, { withTransaction } from "../../config/db";
import UsersRepository from "../../repository/users.repo";
import { iGitHubUpsertInput } from "../../models/users";

afterAll(() => {
    server.close();
});

describe("Postgres config tests", () => {
    it("Should run a SELECT", async () => {
        const sqlString = "SELECT 'test' as t;";
        const result = await pool.query(sqlString);
        expect(result.rows[0].t).toBe("test");
    });
});

describe("withTransaction", () => {
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -2;

    afterEach(async () => {
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    const insertSql = `
        INSERT INTO users (github_id, github_username, github_email, github_noreply_email, github_node_id, github_profile_url, avatar_url)
        VALUES ($1, 'octocat-withtx-test', 'octocat-withtx-test@example.com', '-2+octocat-withtx-test@users.noreply.github.com', 'node-id', 'https://github.com/octocat-withtx-test', 'https://avatars.githubusercontent.com/u/2?v=4')
    `;

    it("commits every query run against the shared client when fn resolves", async () => {
        const result = await withTransaction(async (client) => {
            const inserted = await client.query(`${insertSql} RETURNING id;`, [testGitHubId]);
            return inserted.rows[0].id;
        });

        expect(result).toEqual(expect.any(String));
        const row = await pool.query("SELECT * FROM users WHERE github_id = $1;", [testGitHubId]);
        expect(row.rows).toHaveLength(1);
    });

    it("rolls back every query run against the shared client when fn throws, and rethrows", async () => {
        await expect(
            withTransaction(async (client) => {
                await client.query(`${insertSql};`, [testGitHubId]);
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");

        const row = await pool.query("SELECT * FROM users WHERE github_id = $1;", [testGitHubId]);
        expect(row.rows).toHaveLength(0);
    });

    it("releases the client back to the pool after commit and after rollback", async () => {
        const before = pool.idleCount;
        await withTransaction(async (client) => client.query("SELECT 1;"));
        await expect(withTransaction(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
        expect(pool.idleCount).toBe(before);
    });
});

describe("upsertFromGitHub", () => {
    const repo = UsersRepository.repo();
    // fixed, out-of-range-for-real-GitHub id so this test never collides with real data
    const testGitHubId = -1;

    const baseInput: iGitHubUpsertInput = {
        github_id: testGitHubId,
        github_username: "octocat-test",
        github_email: "octocat-test@example.com",
        github_noreply_email: "1+octocat-test@users.noreply.github.com",
        github_node_id: "MDQ6VXNlcjE=",
        github_profile_url: "https://github.com/octocat-test",
        avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
    };

    afterEach(async () => {
        await pool.query("DELETE FROM users WHERE github_id = $1;", [testGitHubId]);
    });

    it("inserts a new user, reports inserted = true, and stamps last_login_at", async () => {
        const result = await repo.upsertFromGitHub(baseInput);

        expect(result.inserted).toBe(true);
        // pg returns BIGINT columns as strings, since not all BIGINT values fit safely in a JS Number
        expect(Number(result.github_id)).toBe(testGitHubId);
        expect(result.github_username).toBe("octocat-test");
        expect(result.github_email).toBe("octocat-test@example.com");
        expect(result.last_login_at).not.toBeNull();
        expect(result.access_token).toBeUndefined();
    });

    it("updates the existing row, reports inserted = false, and bumps last_login_at on a repeat login", async () => {
        const first = await repo.upsertFromGitHub(baseInput);

        const updatedInput: iGitHubUpsertInput = {
            ...baseInput,
            github_username: "octocat-test-renamed",
            avatar_url: "https://avatars.githubusercontent.com/u/1?v=5",
        };
        const result = await repo.upsertFromGitHub(updatedInput);

        expect(result.inserted).toBe(false);
        // pg returns BIGINT columns as strings, since not all BIGINT values fit safely in a JS Number
        expect(Number(result.github_id)).toBe(testGitHubId);
        expect(result.github_username).toBe("octocat-test-renamed");
        expect(result.avatar_url).toBe("https://avatars.githubusercontent.com/u/1?v=5");
        expect(new Date(result.last_login_at).getTime()).toBeGreaterThanOrEqual(new Date(first.last_login_at).getTime());

        const rowCount = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE github_id = $1;", [testGitHubId]);
        expect(rowCount.rows[0].count).toBe(1);
    });
});