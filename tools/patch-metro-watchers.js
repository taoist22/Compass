#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const projectRootArg = args.find(arg => !arg.startsWith('--'));
const projectRoot = path.resolve(projectRootArg || process.cwd());
const watcherRoot = path.join(
  projectRoot,
  'node_modules',
  'metro-file-map',
  'src',
  'watchers',
);

const patches = [
  {
    file: path.join(watcherRoot, 'NativeWatcher.js'),
    marker: 'async startWatching() {\n    return;',
    find: 'async startWatching() {\n',
    replace: 'async startWatching() {\n    return;\n',
  },
  {
    file: path.join(watcherRoot, 'FallbackWatcher.js'),
    marker: '_watchdir = (dir) => {\n    return true;',
    find: '_watchdir = (dir) => {\n',
    replace: '_watchdir = (dir) => {\n    return true;\n',
  },
];

function log(message) {
  if (!quiet) {
    console.log(message);
  }
}

if (!fs.existsSync(watcherRoot)) {
  log('Metro watcher patch skipped: node_modules/metro-file-map is not installed.');
  process.exit(0);
}

let changed = false;

for (const patch of patches) {
  if (!fs.existsSync(patch.file)) {
    log(`Metro watcher patch skipped missing file: ${path.relative(projectRoot, patch.file)}`);
    continue;
  }

  const original = fs.readFileSync(patch.file, 'utf8');
  if (original.includes(patch.marker)) {
    log(`Metro watcher already patched: ${path.relative(projectRoot, patch.file)}`);
    continue;
  }

  if (!original.includes(patch.find)) {
    console.error(`Metro watcher patch failed; pattern not found in ${patch.file}`);
    process.exitCode = 1;
    continue;
  }

  fs.writeFileSync(patch.file, original.replace(patch.find, patch.replace), 'utf8');
  changed = true;
  log(`Metro watcher patched: ${path.relative(projectRoot, patch.file)}`);
}

if (changed) {
  log('Metro watcher patch complete.');
}
