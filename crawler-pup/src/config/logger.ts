import pino from "pino";

const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:yyyy-mm-dd HH:MM:ss",
    },
  },
});

type LogLevel = "debug" | "info" | "warn" | "error";

function log(
  level: LogLevel,
  objOrMsg: string | object,
  msg?: string,
  ...args: unknown[]
): void {
  if (typeof objOrMsg === "string") {
    if (msg !== undefined) {
      logger[level](
        args.length > 0 ? { extra: args } : {},
        `${objOrMsg} ${msg}`,
      );
    } else {
      logger[level](objOrMsg);
    }
    return;
  }

  if (msg !== undefined) {
    logger[level](objOrMsg, msg, ...args);
  } else {
    logger[level](objOrMsg);
  }
}

export const Logger = {
  debug: (objOrMsg: string | object, msg?: string, ...args: unknown[]) =>
    log("debug", objOrMsg, msg, ...args),
  info: (objOrMsg: string | object, msg?: string, ...args: unknown[]) =>
    log("info", objOrMsg, msg, ...args),
  warn: (objOrMsg: string | object, msg?: string, ...args: unknown[]) =>
    log("warn", objOrMsg, msg, ...args),
  error: (objOrMsg: string | object, msg?: string, ...args: unknown[]) =>
    log("error", objOrMsg, msg, ...args),
};
