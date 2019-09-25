import { SporeCompiler, defineCodeFor } from '../compiler';
import { parse } from 'comment-json';

// support $type object with custom loader.
export default async (compiler: SporeCompiler, obj: { $type: string } | {}) => {
  if (!('$type' in obj)) {
    return false;
  }
  const schemaPath = await compiler.resolveSchema(obj.$type);
  const schemaContext = compiler.options.dirname(schemaPath);
  const schemaObj = parse(await compiler.options.readFile(schemaPath, 'utf-8'));

  if (!schemaObj.loader) {
    // schema has no loader.
    // make the exported schema undefined.
    defineCodeFor(obj, 'undefined');
    return true;
  }

  let loaderImports: { [key: string]: string } = {};

  if (schemaObj.loaderImports) {
    for (let [key, mod] of Object.entries(schemaObj.loaderImports as {
      [key: string]: string;
    })) {
      loaderImports[key] = await compiler.addImport(mod, schemaContext);
    }
  }

  if (compiler.options.hotLoadLoader) {
    // run loader on module initialization.
    const loaderVar = await compiler.addImport(schemaObj.loader, schemaContext);
    const id = compiler.locals.length;
    compiler.locals.push(
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

    const loaderPath = (await compiler.resolveModule(
      m[1],
      schemaContext,
    )).replace(/\.tsx?$/, '.js');

    let loader;
    if (exportName === '*') {
      loader = require(loaderPath);
    } else {
      loader = require(loaderPath)[exportName];
    }
    const id = compiler.locals.length;
    compiler.locals.push(loader(obj, loaderImports));
    defineCodeFor(obj, `__local_${id}`);
  }
  return true;
};
