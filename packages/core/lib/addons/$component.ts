import { SporeCompiler, defineCodeFor } from '../compiler';
import renderObject from '../renderObject';

export type ComponentObject = {
  $component: any;
  props?: any | any[];
  className?: any | any[];
  children?: any[];
};

export default async (compiler: SporeCompiler, obj: ComponentObject | {}) => {
  if (!('$component' in obj)) {
    return false;
  }

  let createElement = await compiler.addImport('react#createElement');

  const propObjectList: string[] = [];

  if (obj.props) {
    if (Array.isArray(obj.props)) {
      for (const item of obj.props) {
        propObjectList.push(renderObject(item));
      }
    } else {
      propObjectList.push(renderObject(obj.props));
    }
  }

  if (obj.className) {
    let className = obj.className;
    if (!Array.isArray(className)) {
      className = [className];
    }
    const classnames = await compiler.addImport('classnames#*');
    propObjectList.push(
      renderObject({
        className: `${classnames}(${className
          .map((v: any) => renderObject(v))
          .join(', ')})`,
      }),
    );
  }

  let propField: string;
  if (propObjectList.length === 1) {
    propField = propObjectList[0];
  } else if (propObjectList.length === 0) {
    propField = 'null';
  } else {
    propField = `Object.assign({}, ${propObjectList.join(',')})`;
  }

  const args = [renderObject(obj.$component), propField];

  if (obj.children) {
    for (const child of obj.children) {
      args.push(renderObject(child));
    }
  }

  if (args.length === 2 && args[1] === 'null') {
    // no children, no props, only contain $component;
    args.pop();
  }

  defineCodeFor(obj, `${createElement}(${args.join(', ')})`);

  return true;
};
