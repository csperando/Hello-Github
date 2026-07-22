import { pino, type Logger } from "pino";
import { Writable } from "node:stream";

const stdout = new Writable({
    write(chunk, _encoding, callback) {
        const { level, time, msg, ...rest } = JSON.parse(chunk.toString());
        const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : "";
        process.stdout.write(`[${time}] ${level.toUpperCase()}: ${msg}${extra}\n`);
        callback();
    },
});

export const logger: Logger = pino(
    {
        levelComparison: "DESC",
        depthLimit: 5,
        edgeLimit: 50,
        redact: [],
        base: null,
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
            level(label) {
                return { level: label };
            },
        },
    },
    stdout,
);
