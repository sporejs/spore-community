const recast = require('recast');
import {
  ASTNode,
  visit,
  Type,
  builtInTypes,
  finalize,
  namedTypes as n,
  builders as b,
  eachField,
  NodePath,
} from 'ast-types';
import renderObject, { SYMBOL_CODE } from './lib/renderObject';
const parser = require('recast/parsers/babel');
const { def } = Type;

// Define imported symbol placeholder.
def('ImportedIdentifier')
  .bases('Expression')
  .build('id')
  .field('id', builtInTypes.number);

def('DataReference')
  .bases('Expression')
  .build('path')
  .field('path', builtInTypes.string.arrayOf());

finalize();

type LoaderFunction<T = any> = (obj: T, imports: string[]) => string;
type Imports = string[];

// Remove any typescript/flow type declaration and annotations.
function removeTyping(ast: ASTNode): ASTNode {
  return visit(ast, {
    visitTypeAlias(path) {
      path.prune();
      return false;
    },
    visitInterfaceDeclaration(path) {
      path.prune();
      return false;
    },
    visitTypeAnnotation(path) {
      path.prune();
      return false;
    },
  });
}

function visitImports(ast: ASTNode): [string[], ASTNode] {
  const imports: string[] = [];

  const stack: any[] = [
    {
      knownIdentifiers: {},
    },
  ];
  const importedSymbols: any = {};
  let exportFunction: ASTNode | null = null;
  let dataArgName: string | null = null;

  function pushStack() {
    let knownIdentifiers: any = {};

    // copy every identifier.
    Object.assign(knownIdentifiers, top.knownIdentifiers);

    stack.push(
      (top = {
        knownIdentifiers,
      }),
    );
  }

  function getIdentifierFromDefinition(dec: any, isVar: boolean = false) {
    if (n.Identifier.check(dec)) {
      if (isVar) {
        // var can be used in whole function before defined.
        throw new Error(
          'var support was not implemented, please use let/const instead.',
        );
      }
      top.knownIdentifiers[dec.name] = top.knownIdentifiers[dec.name] || true;
    }
    if (n.ObjectPattern.check(dec)) {
      for (const property of dec.properties) {
        if ('value' in property) {
          getIdentifierFromDefinition(property.value, isVar);
        }
      }
    }
    if (n.ArrayPattern.check(dec)) {
      for (const elements of dec.elements) {
        getIdentifierFromDefinition(elements, isVar);
      }
    }
    if (n.AssignmentPattern.check(dec)) {
      getIdentifierFromDefinition(dec.left, isVar);
    }
    if (n.RestElement.check(dec)) {
      getIdentifierFromDefinition(dec.argument, isVar);
    }
  }

  function popStack() {
    const ret = stack.pop();
    top = stack[stack.length - 1] || null;
    return ret;
  }

  let top: any = stack[0];

  ast = visit(ast, {
    visitImportDeclaration(path) {
      const source = String(path.node.source.value);

      if (path.node.specifiers) {
        for (const spec of path.node.specifiers) {
          let name = '';
          switch (spec.type) {
            case 'ImportNamespaceSpecifier':
              name = '*';
              break;
            case 'ImportSpecifier':
              name = spec.name ? spec.name.name : '';
              break;
            case 'ImportDefaultSpecifier':
              name = '';
              break;
          }
          const localName = spec.local ? spec.local.name : '';
          importedSymbols[localName] = imports.length;
          imports.push(name ? `${source}#${name}` : source);
        }
      }
      return false;
    },
    visitIdentifier(path) {
      const self = path.node;
      const parent = path.parentPath.node;

      // Skip identifier for object key or memberExpression(a.identifier)
      if (n.Property.check(parent) || n.ObjectProperty.check(parent)) {
        if (self === parent.key) {
          return false;
        }
      }
      if (n.MemberExpression.check(parent)) {
        if (self === parent.property) {
          return false;
        }
      }

      if (top.knownIdentifiers[self.name]) {
        return false;
      }

      if (self.name === dataArgName) {
        // This is data argument.
        path.replace(b.dataReference([]));
        return false;
      }

      const id = importedSymbols[self.name];
      if (id != null) {
        path.replace(b.importedIdentifier(id));
      }
      return false;
    },
    visitBlock(path) {
      pushStack();
      this.traverse(path);
      popStack();
    },

    visitVariableDeclaration(path) {
      const isVar = path.value.kind === 'var';
      for (const item of path.value.declarations) {
        getIdentifierFromDefinition(item.id, isVar);
      }
      this.traverse(path);
    },
    visitCatchClause(path) {
      pushStack();
      getIdentifierFromDefinition(path.value.param);
      this.traverse(path);
      popStack();
    },
    visitFunction(path) {
      if (exportFunction === path.node) {
        // special process data param.
        this.traverse(path);
        return;
      }
      getIdentifierFromDefinition(path.value.id, true);
      pushStack();
      for (const item of path.value.params) {
        if (n.AssignmentExpression.check(item)) {
          getIdentifierFromDefinition(item.left);
        } else {
          getIdentifierFromDefinition(item);
        }
      }
      this.traverse(path);
      popStack();
    },
    visitExportDefaultDeclaration(path) {
      const factory = path.node.declaration;
      if (!n.FunctionDeclaration.check(factory)) {
        throw new Error('Invalid export from factory.');
      }
      if (factory.params.length !== 1) {
        throw new Error('Invalid export from factory.');
      }
      const param = factory.params[0];
      if (!n.Identifier.check(param)) {
        throw new Error('Destructing factory param was not implemented yet.');
      }
      exportFunction = path.node.declaration;
      dataArgName = param.name;
      this.traverse(path);
    },
  });

  let returnedValue: ASTNode | null = null;
  visit(exportFunction!, {
    visitReturnStatement(path) {
      returnedValue = path.node.argument;
      return false;
    },
  });
  return [imports, returnedValue!];
}

function clone(node: ASTNode): ASTNode {
  const copy = b[node.type[0].toLowerCase() + node.type.substr(1)].from(node);
  eachField(copy, function(name, value) {
    if (n.Node.check(value)) {
      copy[name] = clone(value);
      return;
    }
    if (Array.isArray(value)) {
      const tmp = [...value];
      copy[name] = tmp;
      for (const [i, item] of tmp.entries()) {
        if (n.Node.check(item)) {
          tmp[i] = clone(item);
        }
      }
    }
  });
  return copy;
}

function replaceImports(ast: ASTNode, imports: string[]): ASTNode {
  return visit(ast, {
    visitImportedIdentifier(path: any) {
      path.replace(b.identifier(imports[path.node.id]));
      return false;
    },
  } as any);
}

function renderObjectAST(obj: any): ASTNode {
  const source = renderObject(obj);
  const rootAst = recast.parse('(' + source + ')');

  return rootAst.program.body[0].expression;
}

function isTrueValue(ast: any) {
  switch (ast.type) {
    case 'Literal':
      return !!ast.value;
    case 'ObjectExpression':
      return true;
  }
  return false;
}

function isFalseValue(ast: any) {
  switch (ast.type) {
    case 'Literal':
      return !ast.value;
    case 'Identifier':
      return ast.name === 'undefined';
  }
  return false;
}

function isObjectMethod(ast: any, method: string) {
  if (ast.type !== 'MemberExpression') {
    return false;
  }
  return (
    ast.object.type === 'Identifier' &&
    ast.object.name === 'Object' &&
    ast.property.type === 'Identifier' &&
    ast.property.name === method
  );
}

function enumObjectExpression(
  arg: any,
  mapper: (k: any, v: any) => any,
): ASTNode | null {
  if (arg.type !== 'ObjectExpression') {
    return null;
  }
  if (arg.properties.some((v: any) => v.type !== 'Property')) {
    return null;
  }
  return b.arrayExpression(
    arg.properties.map((v: any) => {
      let key = v.key;
      let value = v.value;
      if (key.type === 'Identifier') {
        key = b.literal(key.name);
      }
      return mapper(key, value);
    }),
  );
}

function replaceData(ast: ASTNode, data: any): ASTNode {
  // phase 1: optimize data reference
  ast = visit(ast, {
    visitMemberExpression(path) {
      this.traverse(path);
      if (
        (path.node.object as any).type === 'DataReference' &&
        n.Identifier.check(path.node.property)
      ) {
        path.replace(
          b.dataReference([
            ...(path.node.object as any).path,
            path.node.property.name,
          ]),
        );
      }
    },
  });

  // phase 2: load datas.
  ast = visit(ast, {
    visitDataReference(path: any) {
      let curr = data;
      const rest = [];
      for (const key of path.node.path) {
        if (curr[SYMBOL_CODE]) {
          rest.push(key);
        } else {
          curr = curr[key];
        }
      }
      let replace = renderObjectAST(curr);

      for (const item of rest) {
        replace = b.memberExpression(replace as any, b.identifier(item));
      }
      path.replace(replace);
      return false;
    },
  } as any);

  // phase 3: optimize expressions、condition/repeat expression
  ast = visit(ast, {
    visitExpression(path) {
      this.traverse(path);
    },

    visitIfStatement(path) {
      this.traverse(path);
      if (isTrueValue(path.node.test)) {
        path.replace(path.node.consequent);
      } else if (isFalseValue(path.node.test)) {
        if (path.node.alternate) {
          path.replace(path.node.alternate);
        } else {
          path.prune();
        }
      }
    },

    visitCallExpression(path) {
      this.traverse(path);

      // Precompute Object.entries
      if (isObjectMethod(path.node.callee, 'entries')) {
        const r = enumObjectExpression(
          path.node.arguments[0],
          (k: any, v: any) => {
            return b.arrayExpression([k, v]);
          },
        );
        r && path.replace(r);
      } else if (isObjectMethod(path.node.callee, 'keys')) {
        const r = enumObjectExpression(
          path.node.arguments[0],
          (k: any, v: any) => {
            return b.arrayExpression(k);
          },
        );
        r && path.replace(r);
      } else if (isObjectMethod(path.node.callee, 'values')) {
        const r = enumObjectExpression(
          path.node.arguments[0],
          (k: any, v: any) => {
            return b.arrayExpression(v);
          },
        );
        r && path.replace(r);
      }
    },

    visitVariableDeclarator(path) {
      this.traverse(path);

      if (
        n.ArrayPattern.check(path.node.id) &&
        n.ArrayExpression.check(path.node.init)
      ) {
        // Unzip array pattern assignment

        for (; path.node.init.elements.length > 0; ) {
          const init = path.node.init.elements[0];
          if (n.SpreadElement.check(init) || n.RestElement.check(init)) {
            break;
          }
          const el = path.node.id.elements[0];
          if (n.SpreadElement.check(el)) {
            break;
          }
          path.node.id.elements.shift();
          path.node.init.elements.shift();
          if (!el) {
            continue;
          }
          path.insertBefore(b.variableDeclarator(el, init));
        }

        if (path.node.init.elements.length <= 0) {
          path.prune();
        }
      } else if (
        n.ObjectPattern.check(path.node.id) &&
        n.ObjectExpression.check(path.node.init)
      ) {
        // Unzip object pattern assignment
      }
    },

    visitForOfStatement(path) {
      this.traverse(path);
      let right = path.node.right;
      if (!n.ArrayExpression.check(right)) {
        return;
      }
      if (
        right.elements.some(
          v => v && (v.type === 'RestElement' || v.type === 'SpreadElement'),
        )
      ) {
        return;
      }
      let left = path.node.left;
      let body = path.node.body;
      if (!n.BlockStatement.check(body)) {
        body = b.blockStatement([body]);
      }

      for (const item of right.elements) {
        const clonedBody: any = clone(body);
        let clonedLeft: any = clone(left);

        if (clonedLeft.type === 'VariableDeclaration') {
          // give initial value.
          clonedLeft.declarations[0].init = item;
        } else {
          // build pattern assignment statement.
          clonedLeft = b.expressionStatement(
            b.assignmentExpresssion('=', clonedLeft, item),
          );
        }

        clonedBody.body.unshift(clonedLeft);
        path.insertBefore(clonedBody);
        this.visitWithoutReset(new NodePath({ root: clonedBody }));
      }

      path.prune();
    },
  });

  return ast;
}

export default function loadFactory<T = any>(
  source: string,
): [LoaderFunction<T>, Imports] {
  let ast: ASTNode = recast.parse(source, { parser });

  ast = removeTyping(ast);

  let imports;

  [imports, ast] = visitImports(ast);

  return [
    function(data: T, imports: string[]) {
      let clonedAst = clone(ast);

      clonedAst = replaceImports(clonedAst, imports);

      clonedAst = replaceData(clonedAst, data);

      return '(' + recast.print(clonedAst).code + ')';
    },
    imports,
  ];
}
