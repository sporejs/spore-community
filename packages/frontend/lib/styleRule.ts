import { generator } from './shortId';
import isUnitless from './isUnitLess';

const nextId = generator();

const styleSheet = createStyleSheetNode()!;

function createStyleSheetNode() {
  const node = document.createElement('style');
  document.head.appendChild(node);
  return node.sheet as CSSStyleSheet;
}

export function createClassName() {
  return 'N-' + nextId();
}

export function reactCSSToRaw(
  styles: React.CSSProperties,
  target?: any,
): Partial<CSSStyleDeclaration> {
  for (const key of Object.keys(styles)) {
    let value: any = (styles as any)[key];
    if (typeof value === 'number' && value && !isUnitless(key)) {
      target[key] = '' + value + 'px';
    } else {
      target[key] = '' + value;
    }
  }
  return target;
}

export function createClassRule(styles: Partial<React.CSSProperties>) {
  const className = createClassName();
  createRule(styles, `.${className}`);
  return className;
}

export function createRule(styles: Partial<React.CSSProperties>, rule: string) {
  const index = styleSheet.insertRule(
    rule + ' {} ',
    styleSheet.cssRules.length,
  );
  const cssRule = styleSheet.rules[index] as CSSStyleRule;
  reactCSSToRaw(styles, cssRule.style);
}

export function createStyleSheet<
  T extends {
    [key: string]:
      | (Partial<React.CSSProperties> & { composes?: string | string[] })
      | true;
  }
>(styles: T): { [key in keyof T]: string } {
  const ret: any = {};
  for (const key of Object.keys(styles)) {
    const className = createClassName();
    ret[key] = className;
    if (styles[key] !== true) {
      let { composes, ...rules } = styles[key] as any;
      createRule(rules as Partial<React.CSSProperties>, `.${className}`);
      if (composes) {
        if (Array.isArray(composes)) {
          composes = composes.join(' ');
        }
        ret[key] = className + ' ' + composes;
      }
    }
  }
  return ret;
}
