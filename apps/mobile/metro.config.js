const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the shared sources and the hoisted dependency tree — not the whole
// workspace root.
//
// Two failures bracket this line. Listing only `packages/shared` worked while
// the repo was three unrelated projects sharing a directory; once a real pnpm
// workspace existed, Expo began resolving against the workspace root and the
// entry point failed with "Unable to resolve module
// ./apps/mobile/node_modules/expo-router/entry" — visible on disk, invisible to
// Metro. Watching the workspace root instead fixed that and broke something
// else: Metro then walked apps/web/node_modules too and died in its file map
// ("../web/node_modules/esbuild already exists in the file map as a file").
//
// So: exactly what this app needs, and nothing belonging to the other two.
config.watchFolders = [
  path.resolve(workspaceRoot, 'packages'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Both, in order: the app's own node_modules first, the workspace root second.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Deliberately NOT setting resolver.disableHierarchicalLookup. It is the usual
// advice for a hoisted monorepo, and it breaks pnpm: real package directories
// live under node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>, and they
// find their own dependencies by walking up from there. Cutting that walk off
// resolves the entry point and then fails one import later, inside expo-router.

module.exports = config
