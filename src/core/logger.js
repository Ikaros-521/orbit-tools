/**
 * Orbit Toolbox - Production-Grade Structured Rolling Logger
 * Provides zero-dependency daily rolling logs, scope tagging, retention pruning,
 * and structured error serialization for main & background processes.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

class Logger {
  constructor({ logDir = null, minLevel = 'INFO', maxDays = 7, echoToConsole = true } = {}) {
    this.logDir = logDir;
    this.minLevel = LEVELS[minLevel] !== undefined ? LEVELS[minLevel] : LEVELS.INFO;
    this.maxDays = maxDays;
    this.echoToConsole = echoToConsole;
    this.lastPruneDate = null;
    this._queue = [];
    this._writing = false;
  }

  init(dir) {
    if (dir && typeof dir === 'string') {
      this.logDir = path.resolve(dir);
      try {
        fs.mkdirSync(this.logDir, { recursive: true });
        this.pruneOldLogs();
      } catch (err) {
        console.warn('[Logger] Failed to initialize log directory:', err.message);
      }
    }
  }

  getLogDir() {
    if (this.logDir) return this.logDir;
    // Fallback to OS temp if Electron app not yet ready
    return path.join(os.tmpdir(), 'orbit-tools', 'logs');
  }

  getCurrentLogFile() {
    const today = new Date().toISOString().slice(0, 10);
    return path.join(this.getLogDir(), `orbit-${today}.log`);
  }

  pruneOldLogs() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastPruneDate === today) return;
    this.lastPruneDate = today;

    const dir = this.getLogDir();
    if (!fs.existsSync(dir)) return;

    try {
      const files = fs.readdirSync(dir);
      const logFiles = files.filter(f => /^orbit-\d{4}-\d{2}-\d{2}\.log$/.test(f)).sort();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.maxDays);
      const cutoffStr = `orbit-${cutoffDate.toISOString().slice(0, 10)}.log`;

      for (const file of logFiles) {
        if (file < cutoffStr) {
          try {
            fs.unlinkSync(path.join(dir, file));
          } catch {}
        }
      }
    } catch {}
  }

  _formatMessage(level, scope, msg, extra) {
    const timestamp = new Date().toISOString();
    let text = `[${timestamp}] [${level.padEnd(5)}] [${scope}] ${msg}`;
    if (extra !== undefined) {
      if (extra instanceof Error) {
        text += `\n  Stack: ${extra.stack || extra.message}`;
      } else if (typeof extra === 'object' && extra !== null) {
        try {
          text += ` ${JSON.stringify(extra)}`;
        } catch {
          text += ` [Unserializable Object]`;
        }
      } else {
        text += ` ${String(extra)}`;
      }
    }
    return text + '\n';
  }

  log(levelName, scope, message, extra) {
    const levelVal = LEVELS[levelName] ?? LEVELS.INFO;
    if (levelVal < this.minLevel) return;

    const formatted = this._formatMessage(levelName, scope, message, extra);

    if (this.echoToConsole) {
      const consoleFn = levelName === 'ERROR' ? console.error :
                        levelName === 'WARN'  ? console.warn :
                        levelName === 'DEBUG' ? console.debug : console.log;
      consoleFn(`[${levelName}] [${scope}] ${message}`, extra !== undefined ? extra : '');
    }

    this._queue.push(formatted);
    this._drain();
  }

  _drain() {
    if (this._writing || this._queue.length === 0) return;
    this._writing = true;

    const dir = this.getLogDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}

    const file = this.getCurrentLogFile();
    const batch = this._queue.join('');
    this._queue.length = 0;

    fs.appendFile(file, batch, 'utf8', () => {
      this._writing = false;
      if (this._queue.length > 0) {
        this._drain();
      }
    });
  }

  scope(scopeName) {
    return {
      debug: (msg, extra) => this.log('DEBUG', scopeName, msg, extra),
      info: (msg, extra) => this.log('INFO', scopeName, msg, extra),
      warn: (msg, extra) => this.log('WARN', scopeName, msg, extra),
      error: (msg, extra) => this.log('ERROR', scopeName, msg, extra),
    };
  }
}

// Global default singleton instance
const defaultLogger = new Logger();

module.exports = {
  Logger,
  defaultLogger,
  logger: defaultLogger,
};
