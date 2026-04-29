import { spawn } from 'node:child_process';

function spawnProcess(args, options = {}) {
  return spawn(process.execPath, args, {
    stdio: options.stdio || 'inherit',
    env: process.env,
  });
}

const telegram = spawnProcess(['main.js', 'telegram'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

telegram.on('exit', (code, signal) => {
  if (signal) {
    console.error(`telegram session exited via ${signal}`);
  } else {
    console.error(`telegram session exited with code ${code}`);
  }
});

const cli = spawnProcess(['main.js']);

const shutdown = (code = 0) => {
  if (!telegram.killed) {
    telegram.kill('SIGTERM');
  }
  process.exit(code);
};

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

cli.on('exit', (code, signal) => {
  if (signal) {
    console.error(`cli session exited via ${signal}`);
    shutdown(128 + 15);
    return;
  }

  shutdown(code ?? 0);
});
