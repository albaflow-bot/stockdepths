// Babel config for Expo (native + web builds). The vitest test toolchain uses
// @vitejs/plugin-react instead and does not read this file.
//
// NOTE: this file is `.cjs` (not `.js`) on purpose. package.json declares
// "type": "module", so a plain `babel.config.js` using `module.exports` would be
// loaded as ESM by the native build's Babel and crash. `.cjs` forces CommonJS.
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
