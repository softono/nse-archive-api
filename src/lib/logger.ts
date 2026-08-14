import pino from "pino";

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });

export function infoLog(msg: string, data?: Record<string, unknown>): void {
  logger.info(data ?? {}, msg);
}

export function warningLog(msg: string, data?: Record<string, unknown>): void {
  logger.warn(data ?? {}, msg);
}

export function errorLog(msg: string, data?: Record<string, unknown>): void {
  logger.error(data ?? {}, msg);
}

export default logger;
