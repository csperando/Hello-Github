/// <reference path="./types/express.d.ts" />
import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import { logger } from "./config/logger";
import { config } from "./config/config";
import cors from "./config/cors";
import router from "./routes";
import { stripeWebhookRawParser, stripeWebhookHandler } from "./routes/paymentsWebhook";
import { iResponse } from "./models/response";

const app = express();

app.use(cors);
app.use(cookieParser(config.SESSION_SECRET));

// Stripe webhook - must be registered before router(app), which applies
// bodyParser.json() globally; signature verification needs the raw body.
app.post("/payments/webhook", stripeWebhookRawParser, stripeWebhookHandler);

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
