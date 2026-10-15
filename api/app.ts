/// <reference path="./types/express.d.ts" />
import express from "express";
import cookieParser from "cookie-parser";
import { config } from "./config/config";
import cors from "./config/cors";
import router from "./routes";
import { stripeWebhookRawParser, stripeWebhookHandler } from "./routes/paymentsWebhook";
import { errorHandler } from "./middleware/errorHandler.middleware";

const app = express();
app.disable("x-powered-by");

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
app.use(errorHandler);

export default app;
