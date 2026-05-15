const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the monorepo root so shared packages resolve
config.watchFolders = [monorepoRoot];

// Let Metro resolve from the mobile package node_modules first, then root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Needed for symlinked packages in bun workspaces
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
