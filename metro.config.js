const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// 1. Kikapcsoljuk az Expo 54 új kísérleti importkezelését, ami a nyers import.meta beágyazásért felel weben
config.transformer.experimentalImportSupport = false;

// 2. Megváltoztatjuk a csomag-exportok prioritását: kényszerítjük a Metrót, hogy a CJS/standard verziókat válassza
// Így a Zustand és más libek nem a hibát okozó ESM (.mjs) ágat adják át a webes bundle-nek
if (config.resolver) {
  config.resolver.unstable_conditionNames = [
    "browser",
    "require",
    "react-native",
  ];
}

module.exports = config;
