import { parse } from 'comment-json';
import { CompileOptions, SporeCompiler } from './lib/compiler';
import Resolver = require('enhanced-resolve/lib/Resolver');
import {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory,
} from 'enhanced-resolve';
import { readFileSync } from 'fs';
import { dirname } from 'path';

import $typeAddon from './lib/addons/$type';
import $componentAddon from './lib/addons/$component';

let defaultResolver: Resolver | null = null;

export const defaultOptions: CompileOptions = {
  context: '',
  encoding: 'utf-8',
  hotLoadLoader: false,
  readFile: readFileSync,
  dirname,
  addDependency: () => {},
  resolve: (context, mod) => {
    return new Promise((resolve, reject) => {
      if (!defaultResolver) {
        defaultResolver = ResolverFactory.createResolver({
          fileSystem: new CachedInputFileSystem(
            new NodeJsInputFileSystem(),
            4000,
          ) as any,
          extensions: ['.js', '.json', '.spore'],
        });
      }
      defaultResolver!.resolve({}, context, mod, (err, filepath) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(filepath);
      });
    });
  },
  compilerAddons: [$typeAddon, $componentAddon],
};

export default async function compile(
  filePath: string,
  source?: string,
  options?: Partial<CompileOptions>,
): Promise<string> {
  const finalOptions = { ...defaultOptions, ...options };

  if (!source) {
    source = await finalOptions.readFile(filePath, finalOptions.encoding);
  }

  if (!finalOptions.context) {
    finalOptions.context = finalOptions.dirname(filePath);
  }

  const obj = parse(source);

  const compiler = new SporeCompiler(filePath, obj, finalOptions);

  return compiler.compile();
}
