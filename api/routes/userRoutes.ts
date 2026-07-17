import { Router, NextFunction, Request, Response } from "express";

// import { iApiResponse } from "../models/apiResponse";

const router = Router();

router.all("*", [], async (req: Request, res: Response, next: NextFunction) => {
    // stuff here
    next();
});


router.post("/test", async (req: Request, res: Response, next: NextFunction) => {
    try {
        // pg pool ...
        res.status(200).send("test");

    } catch(err) {
        next(err);
    }
});

export default router;
