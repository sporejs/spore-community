import * as Koa from 'koa';
import 'koa-body';

// Wrap a simple request -> response function to koa handler.
export default function wrapHandler(
  func: (query: any, ctx: Koa.Context) => any,
) {
  return async (ctx: Koa.Context) => {
    // body maybe: buffer | string | stream | object(JSON).
    const body = await func(
      {
        query: ctx.request.query,
        body: ctx.request.body,
        files: ctx.request.files,
        params: ctx.params,
      },
      ctx,
    );
    ctx.body = body;
  };
}
