# jscodeshift-add-imports

[![CircleCI](https://circleci.com/gh/jedwards1211/jscodeshift-add-imports.svg?style=svg)](https://circleci.com/gh/jedwards1211/jscodeshift-add-imports)
[![Coverage Status](https://codecov.io/gh/jedwards1211/jscodeshift-add-imports/branch/master/graph/badge.svg)](https://codecov.io/gh/jedwards1211/jscodeshift-add-imports)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![npm version](https://badge.fury.io/js/jscodeshift-add-imports.svg)](https://badge.fury.io/js/jscodeshift-add-imports)

Easily add import and require statements with jscodeshift. If something is already
imported, returns the locally bound identifier, and avoids name conflicts.

# Usage

```
npm install --save jscodeshift-add-imports
```

```js
const j = require('jscodeshift')
const addImports = require('jscodeshift-add-imports')

const code = `
// @flow
import {foo, type bar} from 'foo'
import baz from 'baz'
`

const root = j(code)
const result = addImports(root, [
  statement`import type {bar, baz} from 'foo'`,
  statement`import blah, {type qux} from 'qux'`,
])
console.log(result)
console.log(root.toSource())
```

Output code:

```js
// @flow
import { foo, type bar } from 'foo'
import baz from 'baz'
import type { baz as baz1 } from 'foo'
import blah, { type qux } from 'qux'
```

Return value:

```js
{
  bar: 'bar',
  baz: 'baz1',
  blah: 'blah',
  qux: 'qux',
}
```

# `addImports(root, statments)`

## Arguments

### `root`

The jscodeshift-wrapped AST of your source code

### `statements`

The AST of an import declaration or variable declaration with requires to add,
or an array of them.

## Return value

An object where the key is the local identifier you requested in `statements`,
and the value is the resulting local identifier used in the modified
code (which could be the existing local identifier already imported in the code or
the local identifier chosen to avoid name conflicts with an existing binding)
