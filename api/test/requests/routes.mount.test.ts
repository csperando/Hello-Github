import request from "supertest";
import server from "../server";

afterAll(() => {
    server.close();
});

describe("Route mounting", () => {
    it("mounts auth routes at /auth", async () => {
        const res = await request(server).get("/auth/github/login");
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("https://github.com/login/oauth/authorize");
    });
});
