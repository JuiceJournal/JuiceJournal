#!/usr/bin/env node

const { spawn } = require('node:child_process');

function runScript(scriptName) {
  const child = spawn(`npm run ${scriptName}`, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: true,
    windowsHide: false
  });

  return child;
}

function startElectronFallback(reason) {
  console.warn(`[DevRuntime] OW-Electron startup failed (${reason}). Falling back to Electron without Overwolf GEP.`);
  console.warn('[DevRuntime] Use `npm run dev:ow` to reproduce the raw OW-Electron failure.');

  const fallback = runScript('dev:electron');
  fallback.on('close', (code) => {
    process.exit(code ?? 1);
  });
}

const overwolf = runScript('dev:ow');

overwolf.on('error', (error) => {
  startElectronFallback(error.message);
});

overwolf.on('close', (code) => {
  if (code) {
    startElectronFallback(`exit code ${code}`);
    return;
  }

  process.exit(code ?? 0);
});
