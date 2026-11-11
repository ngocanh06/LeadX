const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../..');
const workspaceRoot = path.resolve(projectRoot, '../..');
const expectedSiblingDir = path.resolve(projectRoot, '../../scraper_data');

function isDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (err) {
    return false;
  }
}

function scoreScraperDir(dirPath) {
  const markers = [
    ['scraper_overview.json', 3],
    ['export_scraper_stats.py', 3],
    ['topcv_matrix_jobs.xlsx', 2],
    ['topcv/topcv_matrix_jobs.xlsx', 2],
    ['facebook_group/facebook_group_jobs.json', 2],
    ['careerviet_matrix_jobs.xlsx', 1],
    ['vieclam24h_matrix_jobs.xlsx', 1]
  ];

  return markers.reduce((score, [relativePath, weight]) => (
    fs.existsSync(path.join(dirPath, relativePath)) ? score + weight : score
  ), 0);
}

function resolveScraperDataDir() {
  const configuredDir = process.env.SCRAPER_DATA_DIR
    ? path.resolve(projectRoot, process.env.SCRAPER_DATA_DIR)
    : null;

  if (configuredDir && isDirectory(configuredDir)) {
    return configuredDir;
  }

  // The standard layout is D:\Scawl_data\scraper_data, beside lead_x.
  if (isDirectory(expectedSiblingDir)) {
    return expectedSiblingDir;
  }

  // Also support cloned layouts that place scraper_data one directory inside a sibling.
  let nestedCandidates = [];
  try {
    nestedCandidates = fs.readdirSync(workspaceRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(workspaceRoot, entry.name, 'scraper_data'))
      .filter(isDirectory);
  } catch (err) {
    // Keep the expected path as the fallback when the workspace cannot be scanned.
  }

  if (configuredDir && isDirectory(configuredDir)) {
    nestedCandidates.unshift(configuredDir);
  }

  nestedCandidates.sort((a, b) => (
    scoreScraperDir(b) - scoreScraperDir(a) || a.localeCompare(b)
  ));

  return nestedCandidates[0] || expectedSiblingDir;
}

module.exports = resolveScraperDataDir;
