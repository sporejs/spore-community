import renderObject, { SYMBOL_CODE } from '@sporejs/core/lib/renderObject';

export default function cliLoader(data: any, { yargs }: { yargs: string }) {
  const codes = [];

  if (data.usage) {
    codes.push(`${yargs}.usage(${renderObject(data.usage)});`);
  }
  if (data.version) {
    codes.push(`${yargs}.version(${renderObject(data.version)});`);
  }
  if (data.options) {
    for (const [key, value] of Object.entries(data.options)) {
      codes.push(
        `${yargs}.option(${renderObject(key)}, ${renderObject(value)});`,
      );
    }
  }
  if (data.commands) {
    for (const cmdData of data.commands) {
      const { command, aliases, options, desc, handler } = cmdData;
      let builder: any;
      if (options && Object.keys(options).length > 0) {
        const codes: string[] = [];
        for (const [key, value] of Object.entries(options)) {
          codes.push(
            `yargs.option(${renderObject(key)}, ${renderObject(value)});`,
          );
        }
        builder = {
          [SYMBOL_CODE]: `(yargs) => {
            ${codes.join('\n  ')}
          }`,
        };
      }
      codes.push(
        `${yargs}.command(${renderObject({
          command,
          aliases,
          desc,
          builder,
          handler,
        })});`,
      );
    }
    codes.push(`${yargs}.demandCommand();`);
  }
  if (data.handler) {
    codes.push(`${renderObject(data.handler)}(${yargs}.argv);`);
  } else {
    codes.push(`${yargs}.parse();`);
  }

  return `(function () {
    ${codes.join('\n')}
  })`;
}
