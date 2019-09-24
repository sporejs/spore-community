import renderObject from '@sporejs/core/lib/renderObject';

export default function app(
  obj: any,
  imports: { React: string; ReactDOM: string; classnames: string },
) {
  const { ReactDOM, classnames } = imports;

  const codes: string[] = [];

  if (obj.styles && Object.keys(obj.styles).length) {
    codes.push(`Object.assign(el.style, ${renderObject(obj.styles)})`);
  }

  if (obj.className) {
    if (Array.isArray(obj.className)) {
      codes.push(
        `el.className = ${classnames}(${obj.className
          .map((v: any) => renderObject(v))
          .join(',')});`,
      );
    } else {
      codes.push(
        `el.className = ${classnames}(${renderObject(obj.className)});`,
      );
    }
  }

  const ret = `(function(){
    var el = document.createElement('div');
    document.body.appendChild(el);
    ${codes.join('\n    ')}
    ${ReactDOM}.render((${renderObject(obj.tree, imports)}), el);
  })`;
  return ret;
}
