import express, { Request, Response } from "express";

const router = express.Router();

router.all("/", async (req: Request, res: Response) => {
    res.status(200);
    res.send("'Commits for Good' REST API is up and running.");
});

export default router;
