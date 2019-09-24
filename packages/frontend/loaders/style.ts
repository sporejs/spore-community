import renderObject from '@sporejs/core/lib/renderObject';

export function styleRule(obj: any, { createRule }: { createRule: string }) {
  return `(${createRule}(${renderObject(obj.style)}, ${renderObject(
    obj.rule,
  )}))`;
}

export default function style(
  obj: any,
  { createClassRule }: { createClassRule: string },
) {
  return `(${createClassRule}(${renderObject(obj.style)}))`;
}
