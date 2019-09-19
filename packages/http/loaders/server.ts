import renderObject from '@sporejs/core/lib/renderObject';

export default function server(
  data: any,
  {
    runServer,
    Koa,
    KoaBody,
    autoRelease,
    releaseAll,
  }: {
    runServer: string;
    Koa: string;
    KoaBody: string;
    autoRelease: string;
    releaseAll: string;
  },
) {
  const initializes: string[] = [];

  if (data.initializations) {
    for (const item of data.initializations) {
      initializes.push(`${autoRelease}(await ${renderObject(item)}());`);
    }
  }

  const codes = [];

  if (data.middlewares) {
    for (const middleware of data.middlewares) {
      codes.push(`app.use(${renderObject(middleware)});`);
    }
  }

  if (data.body) {
    let option = data.bodyParser;
    if (option === true) {
      option = {};
    }
    codes.push(`app.use(${KoaBody}(${renderObject(option)}));`);
  }

  if (data.router) {
    codes.push(`app.use((${renderObject(data.router)}).routes());`);
  }

  if (data.defaultHandler) {
    codes.push(`app.use(${renderObject(data.defaultHandler)});`);
  }

  return `(async function (options) {
    try {
      ${initializes.join('\n       ')}
      const app = new ${Koa}();
      ${codes.join('\n      ')}
      await ${runServer}(app.callback(), options);
      ${releaseAll}();
    } catch (e) {
      setTimeout(() => {
        throw e;
      })
    }
  })`;
}
