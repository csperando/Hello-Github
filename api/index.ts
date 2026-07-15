import express, { Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";
// TODO - logging, cors, router

const app = express();

// CORS
const whitelist: string[] = ["http://localhost:5173"];
const setCorsOptions = function (req: Request, callback: any) {
    let options = {} as CorsOptions;

    if (whitelist?.indexOf(req.header("Origin") || "") !== -1) {
        options.origin = req.header("Origin");
        options.allowedHeaders = "Content-Type,Authorization,x-auth-token";
    }

    callback(null, options);
};
app.use(cors(setCorsOptions));

app.use("/test", (req: Request, res: Response, next: NextFunction) => {
    // console.log("test");
    res.status(200);
    res.json({
        "data": [4, 2, 3, 1, 4, 2, 4, 2],
        "message": "test",
    });
    res.send();
});

app.use("/", (req: Request, res: Response, next: NextFunction) => {
    // console.log("ping");
    res.status(200);
    res.send("'Commits for Good' REST API is up and running.");
});

// final catch for server errors
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.log("error");
    res.status(500);
    res.send("Error");
});

const port = 3000;
const server = app.listen(port, () => {
    console.log(`REST server up on port [${port}]`);
});

export default server;
