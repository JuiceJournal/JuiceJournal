const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist']);

function collectJavaScriptFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...collectJavaScriptFiles(path.join(dir, entry.name)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

const files = collectJavaScriptFiles(ROOT_DIR);
let hasFailure = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    hasFailure = true;
    process.stderr.write(result.stderr || `Syntax check failed: ${file}\n`);
  }
}

if (hasFailure) {
  process.exit(1);
}

process.stdout.write(`Backend syntax check passed for ${files.length} files.\n`);
