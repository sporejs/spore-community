/**
 * Copyright (c) 2013 kaelzhang <>, contributors
http://kael.me/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Modified by: dengyun@meideng.net to typescript and support $code hook.
 */

const {
  isArray,
  isObject,
  isFunction,
  isNumber,
  isString,
} = require('core-util-is');
const repeat = require('repeat-string');

const {
  PREFIX_BEFORE_ALL,
  PREFIX_BEFORE,
  PREFIX_AFTER_PROP,
  PREFIX_AFTER_COLON,
  PREFIX_AFTER_VALUE,
  PREFIX_AFTER,
  PREFIX_AFTER_ALL,

  BRACKET_OPEN,
  BRACKET_CLOSE,
  CURLY_BRACKET_OPEN,
  CURLY_BRACKET_CLOSE,
  COLON,
  COMMA,
  EMPTY,

  UNDEFINED,
} = require('comment-json/src/parse');

export const SYMBOL_CODE = Symbol.for('@sporejs/code');

// eslint-disable-next-line no-control-regex
const ESCAPABLE = /[\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;

// String constants
const SPACE = ' ';
const LF = '\n';
const STR_NULL = 'null';

// Symbol tags
const BEFORE = (prop: number | string) => `${PREFIX_BEFORE}:${prop}`;
const AFTER_PROP = (prop: number | string) => `${PREFIX_AFTER_PROP}:${prop}`;
const AFTER_COLON = (prop: number | string) => `${PREFIX_AFTER_COLON}:${prop}`;
const AFTER_VALUE = (prop: number | string) => `${PREFIX_AFTER_VALUE}:${prop}`;

// table of character substitutions
const meta: { [key: string]: string } = {
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\f': '\\f',
  '\r': '\\r',
  '"': '\\"',
  '\\': '\\\\',
};

const escapeStr = (string: string) => {
  ESCAPABLE.lastIndex = 0;
  if (!ESCAPABLE.test(string)) {
    return string;
  }

  return string.replace(ESCAPABLE, a => {
    const c = meta[a];
    return typeof c === 'string'
      ? c
      : `\\u${`0000${a.charCodeAt(0).toString(16)}`.slice(-4)}`;
  });
};

// Escape no control characters, no quote characters,
// and no backslash characters,
// then we can safely slap some quotes around it.
const quote = (string: string) => `"${escapeStr(string)}"`;
const comment_stringify = (value: string, line: boolean) =>
  line ? `//${value}` : `/*${value}*/`;

// display_block `boolean` whether the
//   WHOLE block of comments is always a block group
const process_comments = (
  host: any,
  symbol_tag: string,
  deeper_gap: string,
  display_block?: boolean,
) => {
  const comments = host[Symbol.for(symbol_tag)];
  if (!comments || !comments.length) {
    return EMPTY;
  }

  let is_line_comment = false;

  const str = comments.reduce((prev: any, { inline, type, value }: any) => {
    const delimiter = inline ? SPACE : LF + deeper_gap;

    is_line_comment = type === 'LineComment';

    return prev + delimiter + comment_stringify(value, is_line_comment);
  }, EMPTY);

  return display_block ||
    // line comment should always end with a LF
    is_line_comment
    ? str + LF + deeper_gap
    : str;
};

let replacer: any = null;
let indent = EMPTY;

const clean = () => {
  replacer = null;
  indent = EMPTY;
};

const join_content = (inside: string, value: string, gap: string) => {
  const comment = process_comments(value, PREFIX_BEFORE, gap + indent, true);

  return comment
    ? inside
      ? // Symbol.for('before') and Symbol.for('before:prop')
        // might both exist if user mannually add comments to the object
        // and make a mistake.
        // We trim to make sure the layout
        comment + inside.trim() + LF + gap
      : comment.trimRight() + LF + gap
    : inside
    ? inside.trimRight() + LF + gap
    : EMPTY;
};

// | deeper_gap   |
// | gap | indent |
//       [
//                "foo",
//                "bar"
//       ]
const array_stringify = (value: string, gap: string) => {
  const deeper_gap = gap + indent;

  const { length } = value;

  // From the item to before close
  let inside = EMPTY;

  // Never use Array.prototype.forEach,
  // that we should iterate all items
  for (let i = 0; i < length; i++) {
    const before = process_comments(value, BEFORE(i), deeper_gap, true);

    if (i !== 0) {
      inside += COMMA;
    }

    inside += before || LF + deeper_gap;

    // JSON.stringify([undefined])  => [null]
    inside += stringify(i, value, deeper_gap) || STR_NULL;

    inside += process_comments(value, AFTER_VALUE(i), deeper_gap);
  }

  inside += process_comments(value, PREFIX_AFTER, deeper_gap);

  return BRACKET_OPEN + join_content(inside, value, gap) + BRACKET_CLOSE;
};

// | deeper_gap   |
// | gap | indent |
//       {
//                "foo": 1,
//                "bar": 2
//       }
const object_stringify = (value: any, gap: string) => {
  // Due to a specification blunder in ECMAScript, typeof null is 'object',
  // so watch out for that case.
  if (!value) {
    return 'null';
  }

  if (value[SYMBOL_CODE]) {
    // $code is always raw code.
    return value[SYMBOL_CODE];
  }

  const deeper_gap = gap + indent;

  const colon_value_gap = indent ? SPACE : EMPTY;

  // From the first element to before close
  let inside = EMPTY;
  let first = true;

  const iteratee = (key: string) => {
    // Stringified value
    const sv = stringify(key, value, deeper_gap);

    // If a value is undefined, then the key-value pair should be ignored
    if (sv === UNDEFINED) {
      return;
    }

    if (!first) {
      inside += COMMA;
    }

    first = false;

    const before = process_comments(value, BEFORE(key), deeper_gap, true);

    inside += before || LF + deeper_gap;

    inside +=
      quote(key) +
      process_comments(value, AFTER_PROP(key), deeper_gap) +
      COLON +
      process_comments(value, AFTER_COLON(key), deeper_gap) +
      colon_value_gap +
      sv +
      process_comments(value, AFTER_VALUE(key), deeper_gap);
  };

  const keys = Object.keys(value);

  keys.forEach(iteratee);

  inside += process_comments(value, PREFIX_AFTER, deeper_gap);

  return (
    CURLY_BRACKET_OPEN + join_content(inside, value, gap) + CURLY_BRACKET_CLOSE
  );
};

// @param {string} key
// @param {Object} holder
// @param {function()|Array} replacer
// @param {string} indent
// @param {string} gap
function stringify(key: string | number, holder: any, gap: string) {
  let value = holder[key];

  // If the value has a toJSON method, call it to obtain a replacement value.
  if (isObject(value) && isFunction(value.toJSON)) {
    value = value.toJSON(key);
  }

  // If we were called with a replacer function, then call the replacer to
  // obtain a replacement value.
  if (isFunction(replacer)) {
    // usage of replacer changed:
    // replacer
    value = replacer.call(holder, key, value, stringify, gap, indent);
  }

  switch (typeof value as any) {
    case 'string':
      return quote(value);

    case 'number':
      // JSON numbers must be finite. Encode non-finite numbers as null.
      return Number.isFinite(value) ? String(value) : STR_NULL;

    case 'boolean':
    case 'null':
      // If the value is a boolean or null, convert it to a string. Note:
      // typeof null does not produce 'null'. The case is included here in
      // the remote chance that this gets fixed someday.
      return String(value);

    // If the type is 'object', we might be dealing with an object or an array or
    // null.
    case 'object':
      return isArray(value)
        ? array_stringify(value, gap)
        : object_stringify(value, gap);

    // undefined
    default:
    // JSON.stringify(undefined) === undefined
    // JSON.stringify('foo', () => undefined) === undefined
  }
}

const get_indent = (space?: string | number) =>
  isString(space)
    ? // If the space parameter is a string, it will be used as the indent string.
      space
    : isNumber(space)
    ? repeat(SPACE, space)
    : EMPTY;

// @param {function()|Array} replacer
// @param {string|number} space
export default function renderObject(
  value: any,
  replacer_?: any,
  space: string | number = 2,
) {
  // The stringify method takes a value and an optional replacer, and an optional
  // space parameter, and returns a JSON text. The replacer can be a function
  // that can replace values, or an array of strings that will select the keys.
  // A default replacer method can be provided. Use of the space parameter can
  // produce text that is more easily readable.

  // If the space parameter is a number, make an indent string containing that
  // many spaces.
  const indent_ = get_indent(space);

  // ~~If there is a replacer, it must be a function or an array.
  // Otherwise, throw an error.~~
  // vanilla `JSON.parse` allow invalid replacer
  if (!isFunction(replacer_)) {
    replacer_ = null;
  }

  replacer = replacer_;
  indent = indent_;

  const str = stringify('', { '': value }, EMPTY);

  clean();

  return isObject(value)
    ? process_comments(value, PREFIX_BEFORE_ALL, EMPTY).trimLeft() +
        str +
        process_comments(value, PREFIX_AFTER_ALL, EMPTY).trimRight()
    : str;
}
