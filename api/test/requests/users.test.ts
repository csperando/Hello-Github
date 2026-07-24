import { iResponse } from "../../models/response";
import server from "../server";
import request from "supertest";

afterAll(() => {
    server.close();
});

describe("User routes", () => {
    it("Should get all users", async () => {
        const res = await request(server).get("/user");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("Should get a user by id", async () => {
        const res = await request(server).get("/user/550e8400-e29b-41d4-a716-446655440000");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    it("Should get a user by GitHub id", async () => {
        const res = await request(server).get("/user/gh/12");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });

    // not allowed yet
    it("Should create a new user", async () => {
        const res = await request(server).post("/user");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(403);
        expect(body.success).toBe(false);
    });
    
    it("Should update an existing user", async () => {
        const res = await request(server).patch("/user/12");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(403);
        expect(body.success).toBe(false);
    });
    
    it("Should delete an existing user by id", async () => {
        const res = await request(server).delete("/user/12");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(403);
        expect(body.success).toBe(false);
    });
});
