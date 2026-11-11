const { getDefaultConfig } = require("expo/metro-config");
const { existsSync, readFileSync, realpathSync } = require("node:fs");
const { resolve } = require("node:path");

const root = __dirname;
const engine = realpathSync(resolve(root, "node_modules/engine/../../"));
const hosts = new Set(["react", "react-dom", "react-native", "react-native-web", "expo", "expo-status-bar", "react-native-screens", "react-native-safe-area-context", "@expo/metro-runtime"]);
const config = getDefaultConfig(root);
const compiledSpec = resolve(root, ".cache/spec/current.json");
const catalogs = new Set(existsSync(compiledSpec) ? JSON.parse(readFileSync(compiledSpec, "utf8")).surface.world ?? [] : ["countries", "currencies", "languages", "emoji"]);
const catalogFiles = { "countries.json": "countries", "currencies.json": "currencies", "languages.json": "languages", "emojis.json": "emoji" };
const zodLocales = /^\.\.\/locales\/index\.c?js$/;

config.watchFolders = [root, engine];
config.resolver.nodeModulesPaths = [resolve(root, "node_modules"), resolve(engine, "node_modules")];
config.resolver.unstable_enableSymlinks = true;
config.resolver.resolveRequest = ( context, moduleName, platform ) => {

    const head = moduleName.startsWith("@") ? moduleName.split("/").slice(0, 2).join("/") : moduleName.split("/")[0];

    if ( hosts.has(head) ) return context.resolveRequest({ ...context, originModulePath: resolve(root, "index.ts") }, moduleName, platform);
    if ( zodLocales.test(moduleName) && context.originModulePath.includes("/node_modules/zod/") ) return { type: "empty" };

    const file = moduleName.split("/").pop();
    const catalog = moduleName.includes("/data/") && context.originModulePath.includes("/world/") ? catalogFiles[file] : undefined;

    if ( catalog && !catalogs.has(catalog) ) return { type: "sourceFile", filePath: resolve(root, "src/native/empty.json") };

    return context.resolveRequest(context, moduleName, platform);

};

module.exports = config;
