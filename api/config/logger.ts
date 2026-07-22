import { pino, type Logger } from "pino";

export const logger: Logger = pino({
    transport: {
        target: "pino-pretty",
    },
    levelComparison: "DESC",
    depthLimit: 5,
    edgeLimit: 50,
    redact: [],
});
