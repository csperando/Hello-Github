import express, { Request, Response, NextFunction } from "express";
import { logger } from "./config/logger";
import cors from "./config/cors";
import router from "./routes";

const app = express();

app.use(cors);

// routes
// app.use("/{*splat}", (req: Request, res: Response, next: NextFunction) => {
//     logger.info(req);
//     next();
// });

router(app);

// final catch for server errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error(err);
    res.status(500);
    res.send("Error");
});

export default app;
