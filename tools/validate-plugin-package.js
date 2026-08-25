#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {execFileSync} = require('child_process');

const args = new Set(process.argv.slice(2));
const requireNative = args.has('--native');
const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'PluginConfig.json');

function fail(message) {
  console.error(`Package validation failed: ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`Could not read JSON at ${filePath}: ${error.message}`);
  }
}

if (!fs.existsSync(configPath)) {
  fail('PluginConfig.json is missing.');
}

const config = readJson(configPath);
const requiredFields = [
  'name',
  'desc',
  'iconPath',
  'versionName',
  'versionCode',
  'pluginID',
  'pluginKey',
  'jsMainPath',
];

for (const field of requiredFields) {
  if (!config[field] || typeof config[field] !== 'string') {
    fail(`PluginConfig.json is missing string field "${field}".`);
  }
}

const requiredPermissions = [
  'plugin.permission.FILE:READ',
  'plugin.permission.FILE:WRITE',
  'plugin.permission.FILE:DELETE',
  'plugin.permission.INTERNET',
];
if (!Array.isArray(config['uses-permissions'])) {
  fail('PluginConfig.json is missing the "uses-permissions" array.');
}
for (const permission of requiredPermissions) {
  if (!config['uses-permissions'].includes(permission)) {
    fail(`PluginConfig.json is missing required permission "${permission}".`);
  }
}

const packagePath = path.join(
  projectRoot,
  'build',
  'outputs',
  `${config.name}.snplg`,
);

if (!fs.existsSync(packagePath)) {
  fail(`Expected package was not found: ${packagePath}`);
}

let listing;
try {
  listing = execFileSync('unzip', ['-l', packagePath], {encoding: 'utf8'});
} catch (error) {
  fail(`Could not inspect ${packagePath}: ${error.message}`);
}

for (const expected of ['PluginConfig.json']) {
  if (!listing.includes(expected)) {
    fail(`${expected} is missing from the .snplg package.`);
  }
}

let packagedConfig;
try {
  packagedConfig = JSON.parse(
    execFileSync('unzip', ['-p', packagePath, 'PluginConfig.json'], {encoding: 'utf8'}),
  );
} catch (error) {
  fail(`Could not read packaged PluginConfig.json: ${error.message}`);
}
for (const permission of requiredPermissions) {
  if (!packagedConfig['uses-permissions']?.includes(permission)) {
    fail(`Packaged PluginConfig.json is missing required permission "${permission}".`);
  }
}

if (config.iconPath && !listing.includes(path.basename(config.iconPath))) {
  fail(`Configured icon ${config.iconPath} does not appear to be packaged.`);
}

if (requireNative) {
  if (!listing.includes('app.npk')) {
    fail('Native validation requested, but app.npk is missing from .snplg.');
  }

  const generatedConfigPath = path.join(
    projectRoot,
    'build',
    'generated',
    'PluginConfig.json',
  );
  const generatedConfig = readJson(generatedConfigPath);

  if (generatedConfig.nativeCodePackage !== '/app.npk') {
    fail('Native validation requested, but nativeCodePackage is not /app.npk.');
  }
}

console.log(`Package validation passed: ${packagePath}`);
