import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function runCommand(command) {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
    const out = stdout.trim();
    const err = stderr.trim();
    if (out && err) return `${out}\n\nstderr:\n${err}`;
    return out || err || '(no output)';
  } catch (e) {
    return `Error: ${e.message}`;
  }
}
