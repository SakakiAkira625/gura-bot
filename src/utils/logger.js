function formatMessage(level, message) {
  const time = new Date().toISOString().replace('T', ' ').slice(0, 19);
  return `[${time}] [${level}] ${message}`;
}

const logger = {
  info: (message) => console.log(formatMessage('INFO', message)),
  warn: (message) => console.warn(formatMessage('WARN', message)),
  error: (message, error = '') => console.error(formatMessage('ERROR', message), error),
  debug: (message) => console.debug(formatMessage('DEBUG', message)),
};

module.exports = logger;
