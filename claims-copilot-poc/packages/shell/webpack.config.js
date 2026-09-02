const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;

const MFE_URL = process.env.MFE_URL || "http://localhost:3001";
const API_URL = process.env.API_URL || "http://localhost:8000";

module.exports = {
  entry: "./src/index.tsx",
  output: {
    /**
     * Must be absolute, not "auto".
     *
     * The shell is served at arbitrary routes because notification deep links point
     * at paths like /claims/CLM-0061 (DR-3.5). With "auto" the injected script tag is
     * relative, so the browser requests /claims/main.js; historyApiFallback then
     * answers with index.html, the browser fails to parse HTML as JavaScript, and the
     * app never mounts - a blank page on exactly the journey the deep link exists to
     * serve. An absolute publicPath keeps asset URLs correct at any depth.
     *
     * The remote keeps "auto" on purpose: it resolves relative to wherever
     * remoteEntry.js was loaded from, which is what allows it to be hosted
     * independently (DR-3.7).
     */
    publicPath: "/",
    path: path.resolve(__dirname, "dist"),
    clean: true,
  },
  resolve: {
    extensions: [".tsx", ".ts", ".jsx", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        // Workspace packages are symlinked, so they must be included explicitly.
        include: [
          path.resolve(__dirname, "src"),
          path.resolve(__dirname, "../uui-stub/src"),
          path.resolve(__dirname, "../contracts/src"),
          path.resolve(__dirname, "../i18n/src"),
        ],
        // rootMode: "upward" makes Babel use the workspace-root babel.config.json,
        // which is what allows the symlinked @poc/* sources to be transpiled.
        use: { loader: "babel-loader", options: { rootMode: "upward" } },
      },
      { test: /\.css$/, use: ["style-loader", "css-loader"] },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: "meridianShell",
      // Pillar 3 / ADR-003: the Claims experience is a remote loaded at runtime.
      remotes: {
        claimsMfe: `claimsMfe@${MFE_URL}/remoteEntry.js`,
      },
      shared: {
        react: { singleton: true, requiredVersion: "^18.3.1" },
        "react-dom": { singleton: true, requiredVersion: "^18.3.1" },
      },
    }),
    new HtmlWebpackPlugin({
      template: "./public/index.html",
      templateParameters: { API_URL },
    }),
  ],
  devServer: {
    port: 3000,
    historyApiFallback: true,
    hot: true,
    client: { overlay: { warnings: false } },
  },
};
