const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = () => ({
  target: 'electron-renderer',
  context: __dirname,
  output: {
    path: path.resolve(__dirname, '.'),
    filename: 'index.js',
  },
  entry: {
    index: '@sporejs/loader/entry!./src/renderer/index.spore',
  },
  resolve: {
    extensions: ['.ts', '.js', '.spore'],
  },
  resolveLoader: {
    extensions: ['.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        options: {
          compilerOptions: {
            target: 'esnext',
            module: 'esnext',
            esModuleInterop: true,
          },
          onlyCompileBundledFiles: true,
        },
      },
      {
        test: /\.spore$/,
        loader: '@sporejs/loader',
        options: {
          hotLoadLoader: false,
        },
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "./src/renderer/index.ejs"),
    }),
  ],
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          toplevel: true,
          compress: {
            unsafe: true,
            passes: 3,
          },
        },
      }),
    ],
  },
});
