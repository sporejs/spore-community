import { loader } from 'webpack';
import { getOptions } from 'loader-utils';
import compile from '@sporejs/core/compile';
import validateSchema from 'schema-utils';

const optionSchema = {
  type: 'object',
  properties: {
    hotLoadLoader: {
      type: 'boolean',
    },
  },
};

export default function loader(this: loader.LoaderContext, source: string) {
  this.cacheable();
  const callback = this.async();
  const options = getOptions(this) || {};

  validateSchema(optionSchema, options, '@sporejs/loader');

  compile(this.resource, source, {
    context: this.context,
    hotLoadLoader: this.mode === 'development',
    addDependency: file => {
      this.addDependency(file);
    },
    resolve: (context, mod) =>
      new Promise((resolve, reject) => {
        this.resolve(context, mod, (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(result);
        });
      }),
  }).then(result => callback!(null, result), e => callback!(e));
}
