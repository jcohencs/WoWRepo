import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Names people end up with on Windows, in the order we try them. */
export const ENV_FILES = ['.env', '.env.txt', 'env.txt', '.env.local'];

/** Parses KEY=value lines; tolerates a BOM, quotes, spaces, `export` and comments. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[=:]\s*(.*)$/);
    if (!m) continue;
    out[m[1].toUpperCase()] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2').trim();
  }
  return out;
}

/**
 * Loads WCL_* settings from the first env file found next to package.json into process.env
 * and prints one line saying what happened, so a missing key is obvious in the terminal.
 */
export function loadWclEnv(root = resolve(import.meta.dirname, '..')): void {
  const file = ENV_FILES.map((f) => join(root, f)).find((f) => existsSync(f));
  const values = file ? parseEnv(readFileSync(file, 'utf8')) : {};
  for (const [k, v] of Object.entries(values)) if (k.startsWith('WCL_') && v && !process.env[k]) process.env[k] = v;

  const id = process.env.WCL_CLIENT_ID;
  const secret = process.env.WCL_CLIENT_SECRET;
  const tag = '\x1b[33m[parsecheck]\x1b[0m';
  if (id && secret) {
    console.log(`${tag} Warcraft Logs key loaded (${process.env.WCL_SITE === 'classic' ? 'TBC Classic' : 'TBC Anniversary'})${file ? ` from ${file}` : ''}.`);
  } else if (!file) {
    console.log(`${tag} DEMO MODE: no settings file found. Create a file named .env in ${root}`);
  } else {
    const problems = (['WCL_CLIENT_ID', 'WCL_CLIENT_SECRET'] as const)
      .filter((k) => !process.env[k])
      .map((k) => (k in values ? `${k} is there but has nothing after the = sign` : `${k} is not in the file`));
    console.log(`${tag} DEMO MODE: in ${file}, ${problems.join('; ')}. Each line should look like WCL_CLIENT_ID=abc123 on one line.`);
  }
}
