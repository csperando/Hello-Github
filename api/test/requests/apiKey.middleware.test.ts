import express, { Request, Response } from "express";
import request from "supertest";

import { config } from "../../config/config";
import { requireApiKey } from "../../middleware/apiKey.middleware";

const testApp = express();
testApp.get("/protected", requireApiKey, (req: Request, res: Response) => {
    res.status(200).json({ success: true, status: 200 });
});

describe("requireApiKey middleware", () => {
    it("rejects a request with no X-API-Key header", async () => {
        const res = await request(testApp).get("/protected");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("rejects a request with an incorrect X-API-Key", async () => {
        const res = await request(testApp).get("/protected").set("X-API-Key", "wrong-key");
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it("rejects a request with an empty X-API-Key", async () => {
        const res = await request(testApp).get("/protected").set("X-API-Key", "");
        expect(res.status).toBe(401);
    });

    it("allows a request with the correct X-API-Key", async () => {
        const res = await request(testApp).get("/protected").set("X-API-Key", config.SCHEDULER_API_KEY);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
