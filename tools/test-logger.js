/**
 * Orbit Toolbox - Logger Unit Tests
 * Tests rolling file logging, log levels, formatting, scope tags, and retention pruning.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Logger } = require('../src/core/logger');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
  console.log('--- 1. Testing Logger instantiation & file creation ---');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-logger-test-'));
  const logger = new Logger({
    logDir: tempDir,
    minLevel: 'DEBUG',
    echoToConsole: false,
    maxDays: 3,
  });
  logger.init(tempDir);

  const log = logger.scope('test-scope');
  log.info('System initialization test message');
  log.debug('Debug detail data', { pid: 1234, flag: true });
  log.warn('Warning condition triggered', 'resource-low');
  log.error('Simulated fatal error', new Error('Something broke'));

  // Wait for async drain
  await sleep(150);

  const logFile = logger.getCurrentLogFile();
  assert(fs.existsSync(logFile), 'Log file should be created');
  const content = fs.readFileSync(logFile, 'utf8');

  assert(content.includes('[INFO ] [test-scope] System initialization test message'));
  assert(content.includes('[DEBUG] [test-scope] Debug detail data {"pid":1234,"flag":true}'));
  assert(content.includes('[WARN ] [test-scope] Warning condition triggered resource-low'));
  assert(content.includes('[ERROR] [test-scope] Simulated fatal error'));
  assert(content.includes('Something broke'));
  console.log('File logging & level formatting OK');

  console.log('--- 2. Testing minLevel filtering ---');
  const infoOnlyLogger = new Logger({
    logDir: tempDir,
    minLevel: 'WARN',
    echoToConsole: false,
  });
  infoOnlyLogger.init(tempDir);

  const testFile2 = path.join(tempDir, 'filter-test.log');
  infoOnlyLogger.getCurrentLogFile = () => testFile2;

  const scoped2 = infoOnlyLogger.scope('filter');
  scoped2.debug('Should be suppressed');
  scoped2.info('Should also be suppressed');
  scoped2.warn('Should appear');
  scoped2.error('Error should appear');

  await sleep(150);
  assert(fs.existsSync(testFile2), 'Filter log file created');
  const content2 = fs.readFileSync(testFile2, 'utf8');
  assert(!content2.includes('Should be suppressed'), 'DEBUG should be filtered out');
  assert(!content2.includes('Should also be suppressed'), 'INFO should be filtered out');
  assert(content2.includes('Should appear'), 'WARN should be present');
  assert(content2.includes('Error should appear'), 'ERROR should be present');
  console.log('minLevel filtering OK');

  console.log('--- 3. Testing log retention pruning ---');
  // Seed old log files
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 10);
  const oldLogName = `orbit-${oldDate.toISOString().slice(0, 10)}.log`;
  const oldLogPath = path.join(tempDir, oldLogName);
  fs.writeFileSync(oldLogPath, 'old log content from 10 days ago');

  const recentDate = new Date();
  recentDate.setDate(recentDate.getDate() - 1);
  const recentLogName = `orbit-${recentDate.toISOString().slice(0, 10)}.log`;
  const recentLogPath = path.join(tempDir, recentLogName);
  fs.writeFileSync(recentLogPath, 'recent log content from yesterday');

  assert(fs.existsSync(oldLogPath), 'Old log exists before prune');
  assert(fs.existsSync(recentLogPath), 'Recent log exists before prune');

  logger.lastPruneDate = null; // force prune trigger
  logger.pruneOldLogs();

  assert(!fs.existsSync(oldLogPath), 'Old log file (>3 days) should be pruned');
  assert(fs.existsSync(recentLogPath), 'Recent log file (yesterday) should be retained');
  console.log('Retention pruning OK');

  // Cleanup temp dir
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  console.log('\nALL LOGGER TESTS PASSED!');
  process.exit(0);
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
