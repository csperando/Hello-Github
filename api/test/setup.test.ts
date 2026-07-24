import { iResponse } from "../models/response";
import server from "./server";
import request from "supertest";

afterAll(async () => {
    await server.close();
});

describe("Basic tests", () => {
    it("Should pass", () => {
        expect(1).toBe(1);
    });

    it("Should ping the server", async () => {
        const res = await request(server).get("/");
        const body: iResponse = JSON.parse(res.text);
        expect(body.success).toBe(true);
        expect(body.status).toBe(200);
    });

    it("Should have a healthcheck endpoint for docker", async () => {
        const res = await request(server).get("/healthz");
        const body: iResponse = JSON.parse(res.text);
        expect(body.status).toBe("healthy");
    });
});
