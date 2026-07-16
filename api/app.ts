import express, { Request, Response, NextFunction } from "express";
import cors from "./config/cors";
import router from "./routes";

const app = express();

app.use(cors);

// routes
router(app);

// final catch for server errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.log("error");
    res.status(500);
    res.send("Error");
});

export default app;
