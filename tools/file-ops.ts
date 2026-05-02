import { readFile as fsRead, writeFile as fsWrite } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function readFile(path) {
  try {
    const content = await fsRead(resolve(path), 'utf8');
    return content;
  } catch (err) {
    return `Error reading file: ${err.message}`;
  }
}

export async function writeFile(path, content) {
  try {
    await fsWrite(resolve(path), content, 'utf8');
    return `Written to ${path}`;
  } catch (err) {
    return `Error writing file: ${err.message}`;
  }
}

export async function editFile(path, oldStr, newStr) {
  try {
    const abs = resolve(path);
    const content = await fsRead(abs, 'utf8');
    if (!content.includes(oldStr)) {
      return `Error: string not found in ${path}`;
    }
    await fsWrite(abs, content.replace(oldStr, newStr), 'utf8');
    return `Edited ${path}`;
  } catch (err) {
    return `Error editing file: ${err.message}`;
  }
}
