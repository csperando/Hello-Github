import { pino, type Logger } from "pino";
import { Writable } from "node:stream";

/**
 * This is to assist in formatting of errors from the format `new Error(...)`
 * The stack trace included in these errors contain special chars for formatting,
 * and printing as oneline makes review difficult
 * 
 * @param value - this is going to be "rest" from the stdout writable config, or the arguments from logger.error(...)
 * @returns 
 */
function formatValue(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(formatValue);
    }

    if (value && typeof value === "object") {
        const obj: Record<string, unknown> = {};

        for (const [key, val] of Object.entries(value)) {
            if (key === "stack" && typeof val === "string") {
                obj[key] = val.split("\n").map(line => line.trimEnd());
            } else {
                obj[key] = formatValue(val);
            }
        }

        return obj;
    }

    return value;
}

const stdout = new Writable({
    write(chunk, _encoding, callback) {
        const { level, time, msg, ...rest } = JSON.parse(chunk.toString());
        let output = `[${time}] ${level.toUpperCase()}: ${msg}`;
        if(Object.keys(rest).length) output += `\n${JSON.stringify(formatValue(rest), null, 2)}`;
        process.stdout.write(`${output}\n`);
        callback();
    },
});

export const logger: Logger = pino(
    {
        levelComparison: "ASC",
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
