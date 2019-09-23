import webpack from 'webpack';
import path from 'path';
const TerserPlugin = require('terser-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { sync: syncResolve } = require('enhanced-resolve');

interface Argv {
  entry: string;
  output?: string;
  target: 'web' | 'node';
  mode: 'development' | 'production';
  watch: boolean;
}

export default function build(argv: Argv) {
  const entry = path.resolve(argv.entry);
  const output = argv.output && path.resolve(argv.output);

  const htmlPath = syncResolve(
    {},
    path.resolve('.'),
    '@sporejs/compiler/src/index.ejs',
  );
  const compiler = webpack({
    mode: argv.mode,
    target: argv.target,
    context: path.resolve('.'),
    output: output
      ? {
          path: path.dirname(output),
          filename: path.basename(output),
        }
      : {
          path: path.resolve('./dist'),
          filename: '[name].js',
        },
    entry: {
      index: `@sporejs/loader/entry!${entry}`,
    },
    resolve: {
      extensions: ['.ts', '.js', '.spore'],
    },
    resolveLoader: {
      extensions: ['.js'],
    },
    externals:
      argv.target === 'node'
        ? function(context, request, callback: any) {
            // node target shouldn't try to resolve built-in packages,
            // and doesn't needs to pack with any dependencies
            if (
              !/^[.\/]/.test(request) &&
              !path.isAbsolute(request) &&
              !request.startsWith('@sporejs')
            ) {
              callback(null, 'commonjs ' + request);
              return;
            }
            callback();
          }
        : // web target should pack every dependencies
          undefined,
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
    plugins: [new webpack.ProgressPlugin()].concat(
      argv.target === 'web'
        ? [
            new HtmlWebpackPlugin({
              template: htmlPath,
            }),
          ]
        : [],
    ),
  });

  if (argv.watch) {
    compiler.watch({}, (err, stats) => {
      console.log(
        stats.toString({
          chunks: false, // Makes the build much quieter
          colors: true, // Shows colors in the console
        }),
      );
    });
  } else {
    compiler.run((err, stats) => {
      console.log(
        stats.toString({
          chunks: false, // Makes the build much quieter
          colors: true, // Shows colors in the console
        }),
      );
    });
  }
}
