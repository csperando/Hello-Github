import express, { Request, Response, NextFunction } from "express";
import { logger } from "./config/logger";
import cors from "./config/cors";
import router from "./routes";
import { iResponse } from "./models/response";

const app = express();

app.use(cors);

// routes
router(app);

// app.use("/{*splat}", (req: Request, res: Response, next: NextFunction) => {
//     logger.info(req);
//     next();
// });

// final catch for server errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error(err);
    const response: iResponse = { status: 500, success: false, error: err };
    res.status(500).json(response);
});

export default app;
