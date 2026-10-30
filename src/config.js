require('dotenv').config();
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3001,
  rootDir: ROOT_DIR,

  // Modular Data Paths
  dataDir: path.join(ROOT_DIR, 'data'),
  recruitmentDataDir: path.join(ROOT_DIR, 'data', 'recruitment'),
  bdsDataDir: path.join(ROOT_DIR, 'data', 'bds'),

  sheet: {
    csvUrl: process.env.GOOGLE_SHEET_CSV_URL || '',
    cacheTtlSeconds: 60
  },

  browser: {
    userDataDir: path.resolve(ROOT_DIR, process.env.CHROME_USER_DATA_DIR || './chrome_profile'),
    headless: process.env.CHROME_HEADLESS === 'true',
    executablePath: process.env.CHROME_EXECUTABLE_PATH || undefined
  },

  safety: {
    minPostDelaySec: parseInt(process.env.MIN_DELAY_BETWEEN_POSTS_SEC, 10) || 45,
    maxPostDelaySec: parseInt(process.env.MAX_DELAY_BETWEEN_POSTS_SEC, 10) || 90,
    minTypingDelayMs: parseInt(process.env.MIN_TYPING_DELAY_MS, 10) || 15,
    maxTypingDelayMs: parseInt(process.env.MAX_TYPING_DELAY_MS, 10) || 45,
    maxPostsPerDay: parseInt(process.env.MAX_POSTS_PER_DAY, 10) || 50
  },

  dataPath: {
    groupsFile: path.resolve(ROOT_DIR, 'data', 'groups.json'),
    bdsGroupsFile: path.resolve(ROOT_DIR, 'data', 'bds_groups.json'),
    apartmentsFile: path.resolve(ROOT_DIR, 'data', 'apartments.json'),
    historyFile: path.resolve(ROOT_DIR, 'data', 'post_history.json')
  }
};
