import { loader } from 'webpack';

export default function entryLoader(this: loader.LoaderContext) {
  this.cacheable();

  return `import entry from ${JSON.stringify(this.resourcePath)};
entry();`;
}
