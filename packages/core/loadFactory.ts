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

  // phase 2: optimize expressions
  ast = visit(ast, {
    visitExpression(path) {
      this.traverse(path);
    },
  });

  // phase 4: load datas.
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
      path.replace(
        b.identifier(
          `(${renderObject(curr)})` + rest.map(v => `.${v}`).join(''),
        ),
      );
      return false;
    },
  } as any);
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

      return recast.print(clonedAst).code;
    },
    imports,
  ];
}
