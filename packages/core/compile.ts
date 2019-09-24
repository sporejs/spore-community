import { readFileSync } from 'fs';
import { dirname } from 'path';
import { parse, stringify } from 'comment-json';
import {
  NodeJsInputFileSystem,
  CachedInputFileSystem,
  ResolverFactory,
} from 'enhanced-resolve';
import renderObject, { SYMBOL_CODE } from './lib/renderObject';
import Resolver = require('enhanced-resolve/lib/Resolver');

export interface CompileOptions {
  // Directory that contains current file.
  context: string;

  // file encoding for *every* file.
  encoding: string;

  // Do not do code gen on compile time.
  // Instead, we require loaders and run it at module initialization.
  // This enable loader to be hot loaded when use with webpack/nodemon watch mode.
  hotLoadLoader: boolean;

  // read file api.
  // Should use fs.readFileSync or fs.promises.readFile or something similar.
  readFile: (path: string, encoding: string) => string | Promise<string>;

  // base path uri
  dirname: (path: string) => string;

  // Add a dependency for current module.
  // Use for webpack loader.
  addDependency: (file: string) => void;

  // Resolve a module
  resolve: (context: string, mod: string) => string | Promise<string>;
}

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
};

type ImportInfo = {
  id: number;
  module: string;
  default: boolean;
  all: boolean;
  names: {
    [key: string]: true;
  };
};

function defineCodeFor(obj: any, code: string) {
  Object.defineProperty(obj, SYMBOL_CODE, {
    value: code,
  });
}

class SporeCompiler {
  filePath: string;

  // Source Object (not source code)
  source: any;

  // Compile options.
  options: CompileOptions;

  imports: ImportInfo[] = [];
  importsMap: { [key: string]: number } = {};
  importPrefix: string;

  exports: { [key: string]: string } = {};

  constructor(filePath: string, source: any, options: CompileOptions) {
    this.filePath = filePath;
    this.source = source;
    this.options = options;
    this.importPrefix = options.hotLoadLoader ? '__imports.' : '';
  }

  // Resolve a schema path to get it's file path
  resolveSchema(request: string, basePath: string = this.options.context) {
    return this.options.resolve(basePath, request);
  }

  // Resolve a relative module that to be required.
  // Require with module name or absolute should be keeped as is.
  resolveModule(request: string, basePath: string = this.options.context) {
    if (!/^\.?\.?[\\/]/.test(request)) {
      return request;
    }
    return this.options.resolve(basePath, request);
  }

  async addImport(ref: string, basePath: string): Promise<string> {
    const m = /^([^#]*)(?:#(\w*|\*)(\..*)?)?$/.exec(ref);
    if (!m) {
      throw new Error(
        `Invalid $ref ${ref}. must be formed as module#name or module.`,
      );
    }
    const modulePath = m[1] && (await this.resolveModule(m[1], basePath));

    let importObj: ImportInfo;
    if (this.importsMap[modulePath] === undefined) {
      const id = (this.importsMap[modulePath] = this.imports.length);
      importObj = {
        id,
        module: modulePath,
        default: false,
        all: false,
        names: {},
      };
      this.imports.push(importObj);
    } else {
      importObj = this.imports[this.importsMap[modulePath]];
    }
    if (m[2] === '*') {
      importObj.all = true;
      return `__imports_${importObj.id}${m[3] || ''}`;
    } else if (m[2]) {
      importObj.names[m[2]] = true;
      return `__imports_${importObj.id}__${m[2]}${m[3] || ''}`;
    } else {
      importObj.default = true;
      return `__imports_${importObj.id}_default${m[3] || ''}`;
    }
  }

  async visitImports(obj: any, locals: string[]) {
    if (Array.isArray(obj)) {
      for (const value of obj) {
        await this.visitImports(value, locals);
      }
      return;
    }
    if (obj.$ref !== undefined) {
      // imported values.
      defineCodeFor(
        obj,
        this.importPrefix +
          (await this.addImport(obj.$ref, this.options.context)),
      );
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object') {
        await this.visitImports(value, locals);
      }
    }

    if (obj.$type !== undefined) {
      const schemaPath = await this.resolveSchema(obj.$type);
      const schemaContext = this.options.dirname(schemaPath);
      const schemaObj = parse(await this.options.readFile(schemaPath, 'utf-8'));

      if (!schemaObj.loader) {
        // schema has no loader.
        // make the exported schema undefined.
        defineCodeFor(obj, 'undefined');
        return;
      }

      let loaderImports: { [key: string]: string } = {};

      if (schemaObj.loaderImports) {
        for (let [key, mod] of Object.entries(schemaObj.loaderImports as {
          [key: string]: string;
        })) {
          loaderImports[key] =
            this.importPrefix + (await this.addImport(mod, schemaContext));
        }
      }

      if (this.options.hotLoadLoader) {
        // run loader on module initialization.
        const loaderVar =
          this.importPrefix +
          (await this.addImport(schemaObj.loader, schemaContext));
        const id = locals.length;
        locals.push(
          `eval(${loaderVar}(${JSON.stringify(obj)}, ${JSON.stringify(
            loaderImports,
          )}))`,
        );
        defineCodeFor(obj, `__local_${id}`);
      } else {
        // Run loader on compiler side.
        // Should use javascript version instead of typescript version.
        const m = /^([^#]*)(?:#(\w*|\*))?$/.exec(schemaObj.loader);
        if (!m) {
          throw new Error(
            `Invalid loader path : ${schemaObj.loader} of schema : ${schemaPath}`,
          );
        }
        let exportName = m[2] || 'default';

        const loaderPath = (await this.resolveModule(
          m[1],
          schemaContext,
        )).replace(/\.tsx?$/, '.js');

        let loader;
        if (exportName === '*') {
          loader = require(loaderPath);
        } else {
          loader = require(loaderPath)[exportName];
        }
        const id = locals.length;
        locals.push(loader(obj, loaderImports));
        defineCodeFor(obj, `__local_${id}`);
      }
    }
  }

  renderImports(codes: string[]) {
    for (const imp of this.imports) {
      const names = Object.keys(imp.names);
      const modName = imp.module
        ? JSON.stringify(imp.module)
        : JSON.stringify(this.filePath);
      if (imp.all) {
        codes.push(`import * as __imports_${imp.id} from ${modName};`);
      }
      if (names.length > 0 || imp.default) {
        codes.push(
          [
            'import',
            [
              imp.default && `__imports_${imp.id}_default`,
              names.length &&
                '{' +
                  names
                    .map(name => `${name} as __imports_${imp.id}__${name}`)
                    .join(',') +
                  '}',
            ]
              .filter(v => !!v)
              .join(','),
            'from',
            modName,
          ].join(' ') + ';',
        );
      }
    }
  }

  renderImportGetters(codes: string[]) {
    const pushName = (name: string) =>
      codes.push(`Object.defineProperty(__imports, ${JSON.stringify(name)}, {
      get: function(){ return ${name}; }
    })`);
    for (const imp of this.imports) {
      const names = Object.keys(imp.names);
      if (imp.default) {
        pushName(`__imports_${imp.id}_default`);
      }
      if (imp.all) {
        pushName(`__imports_${imp.id}`);
      }
      for (const name of names) {
        pushName(`__imports_${imp.id}__${name}`);
      }
    }
  }

  async compile(): Promise<string> {
    if (
      !this.source ||
      typeof this.source !== 'object' ||
      (!this.source.$type && !this.source.$definitions)
    ) {
      return `export default ${renderObject(this.source)}`;
    }

    const locals: string[] = [];

    // Step1: load objects;
    if (this.source && typeof this.source === 'object') {
      await this.visitImports(this.source, locals);
    }

    const codes: string[] = [
      '// Auto generated code by Spore Engine(https://github.com/sporejs/spore-community)',
      '// DO NOT EDIT THIS FILE. Instead, you should edit the source spore file or the loader function',
    ];
    // Step2: write import codes.
    this.renderImports(codes);

    if (this.options.hotLoadLoader) {
      codes.push('var __imports = []');
      this.renderImportGetters(codes);
    }

    // Step3: write objects.
    for (const [id, object] of locals.entries()) {
      codes.push(`var __local_${id} = ${object};`);
    }

    if (this.source.$definitions) {
      for (const [name, subObj] of Object.entries(this.source.$definitions)) {
        codes.push(`export { ${renderObject(subObj)} as ${name} }`);
      }
    }

    if (this.source.$type) {
      codes.push(`export default ${renderObject(this.source)}`);
    }

    return codes.join('\n');
  }
}

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
