/**
 * Neural Nexus — nexus launcher
 * No prompts. Starts Qdrant if not running, then runs dev:all.
 * If already running, restarts the dev server fresh.
 */
import http from 'http';
import net from 'net';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const isWin = os.platform() === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

function log(msg) {
  console.log(`[nexus] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isPortOpen(port, host = '127.0.0.1') {
  return new Promise(resolve => {
    const socket = net.createConnection({ port, host });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function checkQdrant() {
  return new Promise(resolve => {
    const req = http.get('http://127.0.0.1:5304', res => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => {
        try { resolve(JSON.parse(data)?.title?.includes('qdrant') ?? false); }
        catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function waitForQdrant(maxMs = 90_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    (async function poll() {
      if (await checkQdrant()) return resolve();
      if (Date.now() >= deadline) return reject(new Error('Qdrant did not start within 90s'));
      setTimeout(poll, 1500);
    })();
  });
}

function waitForPortToClose(port, maxMs = 15_000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + maxMs;
    (async function poll() {
      if (!(await isPortOpen(port))) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`Port ${port} did not close after stopping Qdrant`));
      setTimeout(poll, 500);
    })();
  });
}

function startQdrant() {
  log('Starting Qdrant...');
  const qdrantBin = isWin
    ? path.join(ROOT, 'bin', 'qdrant.exe')
    : path.join(ROOT, 'bin', 'qdrant');

  const proc = spawn(qdrantBin, [], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      QDRANT__STORAGE__STORAGE_PATH: path.join(ROOT, 'qdrant_data'),
      QDRANT__SERVICE__HTTP_PORT: '5304',
    },
  });
  proc.unref();
}

function runDevAll() {
  log('Starting Neural Nexus (dev:all)...');
  const proc = spawn(`${npmCmd} run dev:all`, [], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  proc.on('exit', code => {
    log(`dev:all exited with code ${code}`);
    process.exit(code ?? 0);
  });
  process.on('SIGINT',  () => { proc.kill('SIGINT');  });
  process.on('SIGTERM', () => { proc.kill('SIGTERM'); });
}

async function killQdrant() {
  return new Promise(resolve => {
    const cmd = isWin
      ? spawn('taskkill', ['/F', '/IM', 'qdrant.exe'], { stdio: 'ignore', shell: false })
      : spawn('pkill', ['-f', 'qdrant'], { stdio: 'ignore', shell: false });
    cmd.on('close', () => resolve());
    cmd.on('error', () => resolve()); // not running — that's fine
  });
}

async function main() {
  log('Neural Nexus starting up...');

  log('Rebooting Qdrant...');
  await killQdrant();
  await waitForPortToClose(5304).catch(async () => {
    log('Port 5304 still busy after stop request; waiting a bit longer...');
    await sleep(3000);
    if (await isPortOpen(5304)) {
      throw new Error('Port 5304 is still in use after attempting to stop Qdrant');
    }
  });
  await sleep(1000);
  startQdrant();
  log('Waiting for Qdrant...');
  await waitForQdrant();
  log('Qdrant is ready.');

  runDevAll();
}

main().catch(err => {
  console.error('[nexus] Fatal error:', err.message);
  process.exit(1);
});
