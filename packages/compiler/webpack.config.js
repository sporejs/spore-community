const webpack = require('webpack');
const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = () => ({
  target: 'node',
  context: __dirname,
  output: {
    path: path.resolve(__dirname, '.'),
    filename: 'index.js',
  },
  entry: {
    index: '@sporejs/loader/entry!./src/index.spore',
  },
  resolve: {
    extensions: ['.ts', '.js', '.spore'],
  },
  resolveLoader: {
    extensions: ['.js'],
  },
  externals: function(context, request, callback) {
    if (
      !/^[.\/]/.test(request) &&
      !path.isAbsolute(request) &&
      !request.startsWith('@sporejs')
    ) {
      callback(null, 'commonjs ' + request);
      return;
    }
    callback();
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
        loaders: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    targets: {
                      esmodules: true,
                    },
                  },
                ],
              ],
            },
          },
          {
            loader: '@sporejs/loader',
            options: {
              hotLoadLoader: false,
            },
          },
        ],
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
