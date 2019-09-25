import renderObject from '@sporejs/core/lib/renderObject';

export default function component(obj: any) {
  const codes: string[] = [];

  let ret = `function(__props){
    ${codes.join('\n    ')}
    return ${renderObject(obj.tree)};
  }`;

  if (obj.name) {
    ret = `Object.assign(${ret}, {
  displayName: ${renderObject(obj.name)}
})`;
  }

  return ret;
}
