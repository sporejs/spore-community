import renderObject from '@sporejs/core/lib/renderObject';

export default function router(
  data: any,
  {
    KoaRouter,
    wrapHandler,
    KoaBody,
  }: { KoaRouter: string; wrapHandler: string; KoaBody: string },
) {
  const codes = [];

  if (data.body) {
    let option = data.body;
    if (option === true) {
      option = {};
    }
    codes.push(`app.use(${KoaBody}(${renderObject(option)}));`);
  }

  if (data.middlewares) {
    for (const middleware of data.middlewares) {
      codes.push(`router.use(${renderObject(middleware)});`);
    }
  }

  if (data.routes) {
    for (const route of data.routes) {
      codes.push(
        `router.use(${renderObject(route.path)}, (${renderObject(
          route,
        )}).routes());`,
      );
    }
  }

  if (data.paths) {
    for (const path of data.paths) {
      const method = path.method ? path.method.toLowerCase() : 'all';

      const middlewares: string[] = [];

      if (path.body) {
        let option = path.body;
        if (option === true) {
          option = {};
        }
        middlewares.push(`${KoaBody}(${renderObject(option)}), `);
      }

      codes.push(
        `router.${method}(${renderObject(path.path)}, ${middlewares.join(
          '',
        )} ${wrapHandler}(${renderObject(path.handler)}));`,
      );
    }
  }

  return `(function () {
    const router = new ${KoaRouter}();
    ${codes.join('\n    ')}
    return router;
  })()`;
}
