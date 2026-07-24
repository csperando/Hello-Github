import express, { Request, Response } from "express";
import { iResponse } from "../models/response";

const router = express.Router();

router.get("/", async (req: Request, res: Response) => {
    const response: iResponse = { success: true, status: 200, message: "Server up." };
    res.status(200).json(response);
});

router.get("/healthz", async (req: Request, res: Response) => {
    res.status(200).json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

export default router;
