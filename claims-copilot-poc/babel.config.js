/**
 * Root Babel configuration.
 *
 * This must live at the workspace root rather than in each package. A `.babelrc` is
 * package-scoped, so it would not be applied to the symlinked `@poc/uui-stub` and
 * `@poc/contracts` sources that the shell and the Micro-Frontend compile from source.
 *
 * Both webpack configs pass `rootMode: "upward"` on babel-loader so Babel walks up
 * from each package directory to find this file.
 */
module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { chrome: "110" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
    "@babel/preset-typescript",
  ],
};
