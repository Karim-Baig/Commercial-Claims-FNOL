const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;

module.exports = {
  entry: "./src/index.tsx",
  output: {
    publicPath: "auto",
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
      name: "claimsMfe",
      filename: "remoteEntry.js",
      // DR-3.7: the MFE is built and deployed independently of the shell.
      exposes: {
        "./ClaimsApp": "./src/ClaimsApp",
      },
      shared: {
        react: { singleton: true, requiredVersion: "^18.3.1" },
        "react-dom": { singleton: true, requiredVersion: "^18.3.1" },
      },
    }),
    new HtmlWebpackPlugin({ template: "./public/index.html" }),
  ],
  devServer: {
    port: 3001,
    historyApiFallback: true,
    hot: true,
    // The shell on :3000 loads remoteEntry.js from here.
    headers: { "Access-Control-Allow-Origin": "*" },
    client: { overlay: { warnings: false } },
  },
};
