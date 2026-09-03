import pino from 'pino';

const name = process.env.SERVICE_NAME || 'nextgen';

export const logger = pino({ name });
