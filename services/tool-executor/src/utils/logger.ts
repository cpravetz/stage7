import pino from 'pino'

const logger = pino({
  name: 'tool-executor',
  level: process.env.LOG_LEVEL || 'info',
})

export default logger
