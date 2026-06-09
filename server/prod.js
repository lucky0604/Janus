#!/usr/bin/env node
/**
 * Production entry — bootstraps Janus standalone server.
 *
 * Uses tsx to load the TypeScript implementation (server/prod.ts) directly.
 * For Electron packaging, prod.ts is imported from electron/main.ts and
 * does not go through this file.
 */
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prodTsPath = path.join(__dirname, 'prod.ts');

// Spawn tsx as a child so this file stays valid ESM JS at runtime.
const child = spawn(
  process.execPath,
  ['--import', 'tsx', prodTsPath],
  { stdio: 'inherit', env: process.env }
);

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error('[Janus] Failed to start server via tsx:', err);
  process.exit(1);
});
