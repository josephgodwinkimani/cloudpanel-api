#!/usr/bin/env node

/**
 * Queue Worker for CloudPanel API (Refactor: safe execution without changing other files)
 * - Monkey-patch child_process to harden composer/artisan calls:
 *   • composer install -> + --no-scripts --no-interaction --no-progress --no-ansi --prefer-dist
 *   • wrap with nice/ionice + timeout
 *   • per-project flock if path detected from `cd /path && ...`
 *   • artisan migrate --force -> timeout 5m
 * - Single PID lock to avoid multiple workers on same host.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// ====== PID Lock (hindari multiple worker.js di host ini) ======
const PID_LOCK = '/tmp/cloudpanel-worker.pid';
try {
  const fd = fs.openSync(PID_LOCK, 'wx'); // fail if exists
  fs.writeFileSync(fd, String(process.pid));
  fs.closeSync(fd);
  process.on('exit', () => { try { fs.unlinkSync(PID_LOCK); } catch (_) { } });
  process.on('SIGINT', () => { try { fs.unlinkSync(PID_LOCK); } catch (_) { } });
  process.on('SIGTERM', () => { try { fs.unlinkSync(PID_LOCK); } catch (_) { } });
} catch (e) {
  console.error(`[FATAL] Another worker seems running (PID file ${PID_LOCK} exists).`);
  process.exit(1);
}

// ====== Logger ringan (fallback jika utils/logger belum bisa diakses) ======
function log(level, msg, extra = {}) {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}` +
    (Object.keys(extra).length ? ` | ${JSON.stringify(extra)}` : '');
  console.log(line);
}

// ====== Monkey Patch child_process (sebelum require jobQueue) ======
const cp = require('child_process');
const _exec = cp.exec;
const _spawn = cp.spawn;

/** Tambahkan flag kalau belum ada */
function ensureFlag(cmd, flag) {
  return cmd.includes(flag) ? cmd : `${cmd} ${flag}`;
}

/** Deteksi path project dari pola umum: `cd /path && ...` */
function detectProjectPath(cmd) {
  // cari: cd <path> &&  (path tanpa spasi/quote; jika ada quote, tangkap isi)
  let m = cmd.match(/cd\s+(['"]?)([^'"\s;]+)\1\s*&&/);
  if (m && m[2]) return m[2];

  // sebagian orang pakai: (cd /path && ...)
  m = cmd.match(/\(cd\s+(['"]?)([^'"\s;]+)\1\s*&&/);
  if (m && m[2]) return m[2];

  return null; // tidak terdeteksi
}

/** Buat nama lock file per project */
function lockFileFor(projectPath) {
  const safe = (projectPath || 'global').replace(/[^\w.-]+/g, '_');
  return `/tmp/deploy-${safe}.lock`;
}

/** Bungkus command dengan flock + nice/ionice + timeout (aman untuk bash) */
function wrapWithGuards(cmd, { timeout = null, projectPath = null } = {}) {
  const lf = lockFileFor(projectPath || 'global');
  const timeoutPart = timeout ? `timeout ${timeout} ` : '';
  // Pakai bash -lc agar pipeline/&& tetap konsisten
  // flock -n <lock> bash -lc "<nice/ionice/timeout> <cmd>"
  const wrapped = `flock -n ${lf} bash -lc '${timeoutPart}nice -n 10 ionice -c2 -n7 ${cmd.replace(/'/g, "'\\''")}'`;
  return wrapped;
}

/** Rewriter untuk command yang relevan */
function rewriteCommand(cmdRaw) {
  let cmd = cmdRaw;

  // Normalisasi whitespace
  const cmdLower = cmd.toLowerCase();

  const isComposerInstall = /composer(\.phar)?\s+install\b/i.test(cmd);
  const isArtisanMigrate = /\bphp\s+[^;]*artisan\s+migrate\b/i.test(cmd);

  if (isComposerInstall) {
    // Tambahkan flags aman jika belum ada
    cmd = ensureFlag(cmd, '--no-interaction');
    cmd = ensureFlag(cmd, '--no-progress');
    cmd = ensureFlag(cmd, '--no-ansi');
    cmd = ensureFlag(cmd, '--prefer-dist');
    cmd = ensureFlag(cmd, '--no-scripts');      // kunci: cegah package:discover otomatis

    // Deteksi path project untuk flock per-project
    const projectPath = detectProjectPath(cmd);
    cmd = wrapWithGuards(cmd, { timeout: '10m', projectPath });

    log('INFO', 'Rewrote composer install with guards', { projectPath: projectPath || 'global' });
    return cmd;
  }

  if (isArtisanMigrate) {
    // Pastikan --force (kalau belum)
    if (!/--force\b/i.test(cmd)) cmd = `${cmd} --force`;

    // Lock per-project kalau bisa deteksi path
    const projectPath = detectProjectPath(cmd);
    cmd = wrapWithGuards(cmd, { timeout: '5m', projectPath });

    log('INFO', 'Wrapped artisan migrate with timeout & flock', { projectPath: projectPath || 'global' });
    return cmd;
  }

  // Tidak diubah
  return cmdRaw;
}

// Patch exec
cp.exec = function patchedExec(cmd, options, callback) {
  try {
    const newCmd = rewriteCommand(String(cmd));
    return _exec.call(cp, newCmd, options, callback);
  } catch (e) {
    log('WARN', 'exec rewrite failed, running original', { err: e.message });
    return _exec.call(cp, cmd, options, callback);
  }
};

// Patch spawn (hanya kalau argumen pertama adalah shell command composer/artisan umum)
cp.spawn = function patchedSpawn(command, args, options) {
  try {
    // Banyak kode pakai spawn('bash', ['-lc', '...'])
    const isBashLC = command === 'bash' && Array.isArray(args) && args[0] === '-lc' && typeof args[1] === 'string';
    if (isBashLC) {
      args[1] = rewriteCommand(args[1]);
      return _spawn.call(cp, command, args, options);
    }

    // Atau spawn langsung 'composer' / 'php'
    const base = (command || '').toLowerCase();
    if (base.includes('composer') || base === 'php') {
      const joined = [command, ...(args || [])].join(' ');
      const rewritten = rewriteCommand(joined);

      // Jika berubah, jalankan via bash -lc agar aman dengan quotes/guards
      if (rewritten !== joined) {
        return _spawn.call(cp, 'bash', ['-lc', rewritten], options);
      }
    }
    return _spawn.call(cp, command, args, options);
  } catch (e) {
    log('WARN', 'spawn rewrite failed, running original', { err: e.message });
    return _spawn.call(cp, command, args, options);
  }
};

// ====== Setelah monkey patch baru require modul lain ======
const jobQueue = require('./src/services/jobQueue');
const logger = require('./src/utils/logger');

// ====== Graceful shutdown ======
let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger?.warn?.('Force shutdown requested');
    process.exit(1);
  }
  isShuttingDown = true;
  logger?.info?.(`Received ${signal}. Starting graceful shutdown...`);
  try {
    jobQueue.stopWorker?.();
    logger?.info?.('Queue worker stopped successfully');
    process.exit(0);
  } catch (error) {
    logger?.error?.('Error during graceful shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  logger?.error?.('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});
process.on('unhandledRejection', (reason, promise) => {
  logger?.error?.('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// ====== Start Worker ======
async function startWorker() {
  try {
    logger?.info?.('Starting CloudPanel Queue Worker...');

    // Interval tetap sama, seluruh hardening terjadi di monkey patch atas
    await jobQueue.startWorker(3000);

    logger?.info?.('Queue worker started successfully');
    logger?.info?.('Worker is now processing jobs...');

    process.on('message', (message) => {
      if (message === 'shutdown') {
        gracefulShutdown('shutdown message');
      }
    });
  } catch (error) {
    logger?.error?.('Failed to start queue worker:', error);
    process.exit(1);
  }
}

// ====== Banner ======
console.log(`
╔══════════════════════════════════════════════════════╗
║             CloudPanel Queue Worker (Hardened)       ║
║  • composer install -> +no-scripts +prefer-dist      ║
║  • nice/ionice + timeout + per-project flock         ║
║  • migrate --force wrapped with timeout              ║
║  • single PID lock (1 worker per host)               ║
╚══════════════════════════════════════════════════════╝
`);

// ====== Run ======
startWorker().catch(error => {
  logger?.error?.('Failed to start worker:', error);
  process.exit(1);
});
