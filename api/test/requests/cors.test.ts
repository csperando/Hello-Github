import request from "supertest";
import server from "../server";
import { config } from "../../config/config";

afterAll(() => {
    server.close();
});

describe("CORS", () => {
    it("allows the configured FRONTEND_URL origin with credentials", async () => {
        const res = await request(server)
            .get("/")
            .set("Origin", config.FRONTEND_URL);

        expect(res.headers["access-control-allow-origin"]).toBe(config.FRONTEND_URL);
        expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    it("rejects an unlisted origin", async () => {
        const res = await request(server)
            .get("/")
            .set("Origin", "http://evil.example.com");

        expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
});
