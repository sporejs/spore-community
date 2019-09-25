const webpack = require('webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = () => ({
  target: 'electron-main',
  context: __dirname,
  output: {
    path: path.resolve(__dirname, '.'),
    filename: 'index.js',
  },
  entry: {
    index: './src/main/index.ts',
  },
  resolve: {
    extensions: ['.ts', '.js', '.spore'],
  },
  resolveLoader: {
    extensions: ['.js'],
  },
  externals: {
    electron: 'commonjs electron',
    path: 'commonjs path',
    fs: 'commonjs fs',
    url: 'commonjs url',
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
