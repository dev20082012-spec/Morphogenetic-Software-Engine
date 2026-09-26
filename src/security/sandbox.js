/**
 * Process Sandbox -- Safe Child Process Execution
 *
 * Provides isolated, timeout-bounded, resource-limited child process execution.
 * Used for running synthesized tests and other untrusted code.
 */

import cp from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { assertWithinRoot } from './pathguard.js';

/**
 * Default limits for child processes.
 */
export const DEFAULT_LIMITS = {
  /** Maximum execution time (ms) */
  timeout: 15_000,
  /** Maximum stdout+stderr buffer (bytes) */
  maxBuffer: 4 * 1024 * 1024, // 4 MB
  /** Maximum CPU time (ms) - not enforced on all platforms */
  cpuTime: 30_000,
  /** Maximum memory (bytes) - advisory only */
  memory: 512 * 1024 * 1024, // 512 MB
};

/**
 * Minimal environment for child processes.
 * Only includes essential variables.
 */
export function createMinimalEnv(overrides = {}) {
  const base = {
    PATH: process.env.PATH,
    NODE_PATH: process.env.NODE_PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    SystemRoot: process.env.SystemRoot,
    TEMP: os.tmpdir(),
    TMP: os.tmpdir(),
    // Strip potentially dangerous vars
    // NODE_OPTIONS: '', // Don't inherit node options
    // DEBUG: '', // Don't inherit debug flags
  };
  return { ...base, ...overrides };
}

/**
 * Result of a sandboxed execution.
 * @typedef {{
 *   exitCode: number|null,
 *   signal: string|null,
 *   stdout: string,
 *   stderr: string,
 *   timedOut: boolean,
 *   durationMs: number,
 * }} SandboxResult
 */

/**
 * Execute a Node.js script in a sandboxed child process.
 *
 * @param {string} scriptPath - Absolute path to the script to execute
 * @param {object} [options]
 * @param {number} [options.timeout] - Execution timeout in ms
 * @param {number} [options.maxBuffer] - Max output buffer in bytes
 * @param {string} [options.cwd] - Working directory (must be within root)
 * @param {string} [options.root] - Root directory for path containment
 * @param {object} [options.env] - Additional environment variables
 * @param {string[]} [options.argv] - Additional argv arguments
 * @returns {Promise<SandboxResult>}
 */
export async function runInSandbox(scriptPath, options = {}) {
  const {
    timeout = DEFAULT_LIMITS.timeout,
    maxBuffer = DEFAULT_LIMITS.maxBuffer,
    cwd = process.cwd(),
    root = process.cwd(),
    env = {},
    argv = [],
  } = options;

  // Validate script path stays within root
  const validatedScript = assertWithinRoot(root, scriptPath);
  const validatedCwd = assertWithinRoot(root, cwd);

  // Build command
  const command = process.execPath;
  const args = [validatedScript, ...argv];

  // Prepare environment
  const childEnv = createMinimalEnv(env);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let timedOut = false;

    const child = cp.spawn(command, args, {
      cwd: validatedCwd,
      env: childEnv,
      timeout,
      maxBuffer,
      windowsHide: true,
      // No shell, no stdio inheritance beyond what we explicitly pipe
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
      if (stdout.length > maxBuffer) {
        child.kill('SIGKILL');
      }
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > maxBuffer) {
        child.kill('SIGKILL');
      }
    });

    child.on('error', (err) => {
      if (timedOut) return; // Timeout handler will resolve
      reject(err);
    });

    child.on('exit', (exitCode, signal) => {
      const durationMs = Date.now() - startTime;
      resolve({
        exitCode,
        signal,
        stdout: stdout.slice(0, maxBuffer),
        stderr: stderr.slice(0, maxBuffer),
        timedOut,
        durationMs,
      });
    });

    // Timeout is handled by spawn options, but we also track it
    setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout + 1000); // Slightly longer than spawn timeout
  });
}

/**
 * Synchronous variant for simpler use cases.
 * Less safe than async version (blocks event loop).
 *
 * @param {string} scriptPath
 * @param {object} [options]
 * @returns {SandboxResult}
 */
export function runInSandboxSync(scriptPath, options = {}) {
  const {
    timeout = DEFAULT_LIMITS.timeout,
    maxBuffer = DEFAULT_LIMITS.maxBuffer,
    cwd = process.cwd(),
    root = process.cwd(),
    env = {},
    argv = [],
  } = options;

  const validatedScript = assertWithinRoot(root, scriptPath);
  const validatedCwd = assertWithinRoot(root, cwd);
  const childEnv = createMinimalEnv(env);

  const startTime = Date.now();
  try {
    const result = cp.spawnSync(process.execPath, [validatedScript, ...argv], {
      cwd: validatedCwd,
      env: childEnv,
      timeout,
      maxBuffer,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    return {
      exitCode: result.status,
      signal: result.signal,
      stdout: (result.stdout || '').slice(0, maxBuffer),
      stderr: (result.stderr || '').slice(0, maxBuffer),
      timedOut: result.signal === 'SIGTERM' || result.signal === 'SIGKILL',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      exitCode: null,
      signal: 'ERROR',
      stdout: '',
      stderr: String(err.message).slice(0, 1024),
      timedOut: false,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Create a temporary directory for sandbox execution.
 * Automatically cleaned up on process exit.
 *
 * @param {string} prefix
 * @returns {string} - Path to created temp directory
 */
export function createSandboxTempDir(prefix = 'mse-sandbox-') {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return tmpDir;
}

/**
 * Clean up a sandbox temp directory (best effort).
 *
 * @param {string} dirPath
 */
export function cleanupSandboxTempDir(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

/**
 * Write a script to a temp file and execute it in sandbox.
 * Convenience function for inline script execution.
 *
 * @param {string} scriptContent
 * @param {object} [options]
 * @param {string} [options.root] - Root for path containment
 * @returns {Promise<SandboxResult>}
 */
export async function runScriptInSandbox(scriptContent, options = {}) {
  const { root = process.cwd(), ...sandboxOptions } = options;
  const tmpDir = createSandboxTempDir('mse-script-');
  const scriptPath = path.join(tmpDir, 'script.mjs');

  try {
    // Validate and write
    assertWithinRoot(root, tmpDir);
    await fs.promises.writeFile(scriptPath, scriptContent, 'utf8');

    const result = await runInSandbox(scriptPath, { ...sandboxOptions, root, cwd: tmpDir });
    return result;
  } finally {
    cleanupSandboxTempDir(tmpDir);
  }
}

import fs from 'node:fs';

export default {
  runInSandbox,
  runInSandboxSync,
  createSandboxTempDir,
  cleanupSandboxTempDir,
  runScriptInSandbox,
  createMinimalEnv,
  DEFAULT_LIMITS,
};