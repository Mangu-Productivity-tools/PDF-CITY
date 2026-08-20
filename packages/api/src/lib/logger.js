import pino from 'pino';

// JSON structured logs per spec: timestamp (ISO 8601), level, jobId, correlationId, message.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
});
