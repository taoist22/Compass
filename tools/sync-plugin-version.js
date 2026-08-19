#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const packagePath = path.join(projectRoot, 'package.json');
const configPath = path.join(projectRoot, 'PluginConfig.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const packageJson = readJson(packagePath);
const config = readJson(configPath);

config.versionName = packageJson.version;

const currentVersionCode = Number.parseInt(config.versionCode || '0', 10);
config.versionCode = String(Number.isFinite(currentVersionCode) ? currentVersionCode + 1 : 1);

writeJson(configPath, config);

console.log(
  `Synced PluginConfig.json to versionName=${config.versionName}, versionCode=${config.versionCode}`,
);
