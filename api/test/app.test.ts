import request from "supertest";
import app from "../app";

describe("app", () => {
    it("routes GET / through the full middleware stack", async () => {
        const response = await request(app).get("/");
        expect(response.status).toBe(200);
        expect(response.text).toBe("'Commits for Good' REST API is up and running.");
    });

    it("echoes Access-Control-Allow-Origin for a whitelisted origin", async () => {
        const response = await request(app).get("/").set("Origin", "http://localhost:5173");
        expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });

    it("denies Access-Control-Allow-Origin for a non-whitelisted origin", async () => {
        const response = await request(app).get("/").set("Origin", "http://evil.example.com");
        expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    });
});
