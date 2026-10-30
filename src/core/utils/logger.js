/**
 * logger.js - Logger tiện ích cho FB Group Engine
 */
function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
  info: (...args) => console.log(`[INFO  ${getTimestamp()}]`, ...args),
  success: (...args) => console.log(`\x1b[32m[OK    ${getTimestamp()}]\x1b[0m`, ...args),
  warn: (...args) => console.log(`\x1b[33m[WARN  ${getTimestamp()}]\x1b[0m`, ...args),
  error: (...args) => console.log(`\x1b[31m[ERROR ${getTimestamp()}]\x1b[0m`, ...args)
};

module.exports = logger;
