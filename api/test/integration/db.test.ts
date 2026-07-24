import server from "../server";
import pool from "../../config/db";

afterAll(async () => {
    await server.close();
});

describe("Postgres config tests", () => {
    it("Should run a SELECT", async () => {
        const sqlString = "SELECT 'test' as t;";
        const result = await pool.query(sqlString);
        expect(result.rows[0].t).toBe("test");
    });
});