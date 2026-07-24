import { iResponse } from "../../models/response";
import server from "../server";
import request from "supertest";

afterAll(() => {
    server.close();
});

describe("User routes", () => {
    it("Should get all organizations", async () => {
        const res = await request(server).get("/org");
        const body: iResponse = JSON.parse(res.text);
        expect(res.status).toBe(200);
        expect(body.success).toBe(true);
    });
});
