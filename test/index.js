const { describe, it } = require('mocha')
const { expect } = require('chai')
const jscodeshift = require('jscodeshift')

const addImports = require('..')

const j = jscodeshift.withParser('babylon')
const { statement } = j.template

describe(`addImports`, function() {
  describe(`for require statement`, function() {
    it(`throws if statement contains a non-require declarator`, function() {
      const code = `import Baz from 'baz'`
      expect(() =>
        addImports(
          j(code),
          statement`const foo = require('baz'), bar = invalid(true)`
        )
      ).to.throw(Error)
    })
    it(`leaves existing non-default imports with alias untouched`, function() {
      const code = `import {foo as bar} from 'baz'`
      const root = j(code)
      const result = addImports(
        root,
        statement`const {foo: qux} = require('baz')`
      )
      expect(result).to.deep.equal({ qux: 'bar' })
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing non-default imports with alias`, function() {
      const code = `import {blah as bar} from 'baz'`
      const root = j(code)
      addImports(root, statement`const {foo: qux} = require('baz')`)
      expect(root.toSource()).to.equal(`${code}

const {
  foo: qux
} = require('baz');`)
    })
    it(`leaves existing non-default imports without alias untouched`, function() {
      const code = `import {foo} from 'baz'`
      const root = j(code)
      const result = addImports(
        root,
        statement`const {foo: qux} = require('baz')`
      )
      expect(result).to.deep.equal({ qux: 'foo' })
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing non-default imports without alias`, function() {
      const code = `import {bar} from 'baz'`
      const root = j(code)
      addImports(root, statement`const {foo: qux} = require('baz')`)
      expect(root.toSource()).to.equal(`${code}

const {
  foo: qux
} = require('baz');`)
    })
    it(`merges destructuring`, function() {
      const code = `const {foo} = require('bar')`
      const root = j(code)
      addImports(root, statement`const {bar} = require('bar')`)
      expect(root.toSource()).to.equal(`const {
  foo,
  bar
} = require('bar')`)
    })
    it(`leaves existing non-default requires without alias untouched`, function() {
      const code = `const {foo} = require('baz')`
      const root = j(code)
      const result = addImports(
        root,
        statement`const {foo: qux} = require('baz')`
      )
      expect(result).to.deep.equal({ qux: 'foo' })
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing non-default requires without alias`, function() {
      const code = `const {bar} = require('baz')`
      const root = j(code)
      const result = addImports(
        root,
        statement`const {foo: qux} = require('baz')`
      )
      expect(result).to.deep.equal({ qux: 'qux' })
      expect(root.toSource()).to.equal(`const {
  bar,
  foo: qux
} = require('baz')`)
    })
    it(`leaves existing default requires untouched `, function() {
      const code = `const foo = require('baz')`
      const root = j(code)
      const result = addImports(root, statement`const qux = require('baz')`)
      expect(result).to.deep.equal({ qux: 'foo' })
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing default requires`, function() {
      const code = `const foo = require('foo')`
      const root = j(code)
      addImports(root, statement`const qux = require('baz')`)
      expect(root.toSource()).to.equal(`const qux = require('baz');
${code}`)
    })
    it(`avoids name conflicts`, function() {
      const code = `const foo = require('foo')`
      const root = j(code)
      const result = addImports(root, statement`const foo = require('bar')`)
      expect(result).to.deep.equal({ foo: 'foo1' })
      expect(root.toSource()).to.equal(`const foo1 = require('bar');
${code}`)
    })
    it(`avoids name conflicts with ObjectPattern`, function() {
      const code = `const {foo} = require('foo')`
      const root = j(code)
      const result = addImports(root, statement`const {foo} = require('bar')`)
      expect(result).to.deep.equal({ foo: 'foo1' })
      expect(root.toSource()).to.equal(`const {
  foo: foo1
} = require('bar');

${code}`)
    })
    it(`adds separate declaration if init is MemberExpression`, function() {
      const code = `const foo = require('foo').default`
      const root = j(code)
      const result = addImports(root, statement`const {bar} = require('foo')`)
      expect(result).to.deep.equal({ bar: 'bar' })
      expect(root.toSource()).to.equal(`const {
  bar
} = require('foo');

${code}`)
    })
  })
  describe(`for import statement`, function() {
    it(`leaves existing default imports untouched`, function() {
      const code = `import Baz from 'baz'`
      const root = j(code)
      const result = addImports(root, statement`import Foo from 'baz'`)
      expect(result).to.deep.equal({ Foo: 'Baz' })
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing default imports`, function() {
      const code = `import {baz} from 'baz'`
      const root = j(code)
      addImports(root, statement`import Foo from 'baz'`)
      expect(root.toSource()).to.equal(`import Foo, { baz } from 'baz';`)
    })
    it(`adds missing default imports case 2`, function() {
      const code = `import bar from 'bar'`
      const root = j(code)
      addImports(root, statement`import Foo from 'baz'`)
      expect(root.toSource()).to.equal(`${code}
import Foo from "baz";`)
    })
    it(`leaves existing funky default imports untouched`, function() {
      const code = `import {default as Baz} from 'baz'`
      const root = j(code)
      const result = addImports(
        root,
        statement`import {default as Foo} from 'baz'`
      )
      expect(result).to.deep.equal({ Foo: 'Baz' })
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing funky default imports`, function() {
      const code = `import {baz} from 'baz'`
      const root = j(code)
      const result = addImports(
        root,
        statement`import {default as Foo} from 'baz'`
      )
      expect(result).to.deep.equal({ Foo: 'Foo' })
      expect(root.toSource()).to.equal(
        `import { baz, default as Foo } from 'baz';`
      )
    })
    it(`adds missing funky default imports case 2`, function() {
      const code = `import {bar} from 'bar'`
      const root = j(code)
      addImports(root, statement`import {default as Foo} from 'baz'`)
      expect(root.toSource()).to.equal(`${code}
import { default as Foo } from "baz";`)
    })
    it(`leaves existing non-default import specifiers with aliases untouched`, function() {
      const code = `import {foo as bar} from 'baz'`
      const root = j(code)
      addImports(root, statement`import {foo as qux} from 'baz'`)
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing non-default import specifiers with aliases`, function() {
      const code = `import {qlob as bar} from 'baz'`
      const root = j(code)
      addImports(root, statement`import {foo as qux} from 'baz'`)
      expect(root.toSource()).to.equal(
        `import { qlob as bar, foo as qux } from 'baz';`
      )
    })
    it(`adds missing non-default import specifiers with aliases case 2`, function() {
      const code = `import {qlob as bar} from 'bar'`
      const root = j(code)
      addImports(root, statement`import {foo as qux} from 'foo'`)
      expect(root.toSource()).to.equal(`${code}
import { foo as qux } from "foo";`)
    })
    it(`leaves existing non-default import type specifiers with aliases untouched`, function() {
      const code = `
import {foo as bar} from 'baz'
import type {foo as qlob} from 'baz'`
      const root = j(code)
      addImports(root, statement`import type {foo as qux} from 'baz'`)
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing non-default import type specifiers with aliases`, function() {
      const code = `
import {foo as bar} from 'baz'
import type {glab as qlob} from 'baz'`
      const root = j(code)
      addImports(root, statement`import type {foo as qux} from 'baz'`)
      expect(root.toSource()).to.equal(`
import {foo as bar} from 'baz'
import type { glab as qlob, foo as qux } from 'baz';`)
    })
    it(`adds missing non-default import type specifiers with aliases case 2`, function() {
      const code = `
import {foo as bar} from 'baz'
import type { glab as qlob } from "qlob";`
      const root = j(code)
      addImports(root, statement`import type {foo as qux} from 'baz'`)
      expect(root.toSource()).to.equal(`
import { foo as bar, type foo as qux } from 'baz';
import type { glab as qlob } from "qlob";`)
    })
    it(`converts import type {} to import {type} if necessary`, function() {
      const code = `
import type {foo as bar} from 'baz'
`
      const root = j(code)
      addImports(root, statement`import {foo as qux} from 'baz'`)
      expect(root.toSource()).to.equal(`
import { type foo as bar, foo as qux } from 'baz';
`)
    })
    it(`leaves existing non-default import specifiers without aliases untouched`, function() {
      const code = `import {foo} from 'baz'`
      const root = j(code)
      addImports(root, statement`import {foo} from 'baz'`)
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing non-default import specifiers without aliases`, function() {
      const code = `import {baz} from 'baz'`
      const root = j(code)
      addImports(root, statement`import {foo} from 'baz'`)
      expect(root.toSource()).to.equal(`import { baz, foo } from 'baz';`)
    })
    it(`adds missing non-default import specifiers without aliases case 2`, function() {
      const code = `import {baz} from 'baz'`
      const root = j(code)
      addImports(root, statement`import {foo} from 'foo'`)
      expect(root.toSource()).to.equal(`${code}
import { foo } from "foo";`)
    })
    it(`leaves existing non-default require specifiers with aliases untouched`, function() {
      const code = `const {foo: bar} = require('baz')`
      const root = j(code)
      addImports(root, statement`import {foo} from 'baz'`)
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing non-default require specifiers with aliases`, function() {
      const code = `const {bar} = require('baz')`
      const root = j(code)
      addImports(root, statement`import {foo} from 'baz'`)
      expect(root.toSource()).to.equal(`import { foo } from "baz";
${code}`)
    })
    it(`leaves existing namespace imports untouched`, function() {
      const code = `import * as React from 'react'`
      const root = j(code)
      addImports(root, statement`import * as R from 'react'`)
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing namespace imports`, function() {
      const code = `import R from 'react'`
      const root = j(code)
      addImports(root, statement`import * as React from 'react'`)
      expect(root.toSource()).to.equal(`import R, * as React from 'react';`)
    })
    it(`leaves existing require defaults with commonjs: false untouched`, function() {
      const code = `const bar = require('foo').default`
      const root = j(code)
      addImports(root, statement`import foo from 'foo'`)
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing require defaults with commonjs: false`, function() {
      const code = `const {bar} = require('foo').default`
      const root = j(code)
      addImports(root, statement`import foo from 'foo'`)
      expect(root.toSource()).to.equal(`import foo from "foo";
${code}`)
    })
    it(`leaves existing destructured require defaults with commonjs: false untouched`, function() {
      const code = `const {default: bar} = require('foo')`
      const root = j(code)
      addImports(root, statement`import foo from 'foo'`)
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing destructured require defaults with commonjs: false`, function() {
      const code = `const {default: bar} = require('bar')`
      const root = j(code)
      addImports(root, statement`import foo from 'foo'`)
      expect(root.toSource()).to.equal(`import foo from "foo";
${code}`)
    })
    it(`leaves existing require defaults with commonjs: true untouched`, function() {
      const code = `const bar = require('foo')`
      const root = j(code)
      addImports(root, statement`import foo from 'foo'`, { commonjs: true })
      expect(root.toSource()).to.equal(code)
    })
    it(`adds missing require defaults with commonjs: true`, function() {
      const code = `const bar = require('bar')`
      const root = j(code)
      addImports(root, statement`import foo from 'foo'`, { commonjs: true })
      expect(root.toSource()).to.equal(`import foo from "foo";
${code}`)
    })
    it(`avoids name conflicts`, function() {
      const code = `import foo from 'foo'`
      const root = j(code)
      addImports(root, statement`import foo from 'bar'`)
      expect(root.toSource()).to.equal(`${code}
import foo1 from "bar";`)
    })
    it(`avoids name conflicts with import type`, function() {
      const code = `// @flow
import type foo from 'foo'`
      const root = j(code)
      const result = addImports(root, statement`import type foo from 'bar'`)
      expect(result).to.deep.equal({ foo: 'foo1' })
      expect(root.toSource()).to.equal(`${code}
import type foo1 from "bar";`)
    })
    it(`avoids name conflicts with import type {}`, function() {
      const code = `// @flow
import type {foo} from 'foo'`
      const root = j(code)
      const result = addImports(root, statement`import type {foo} from 'bar'`)
      expect(result).to.deep.equal({ foo: 'foo1' })
      expect(root.toSource()).to.equal(`${code}
import type { foo as foo1 } from "bar";`)
    })
    it(`avoids name conflicts with import {type}`, function() {
      const code = `// @flow
import {type foo} from 'foo'`
      const root = j(code)
      const result = addImports(root, statement`import {type foo} from 'bar'`)
      expect(result).to.deep.equal({ foo: 'foo1' })
      expect(root.toSource()).to.equal(`${code}
import { type foo as foo1 } from "bar";`)
    })
    it(`doesn't break leading comments`, function() {
      const code = `// @flow
/* @flow-runtime enable */
const bar = 'baz'`
      const root = j(code)
      addImports(root, statement`import foo from 'foo'`)
      expect(root.toSource()).to.deep.equal(`// @flow
/* @flow-runtime enable */
import foo from "foo";

const bar = 'baz';`)
    })
    it(`multiple statements and specifiers`, function() {
      const code = `// @flow
import {foo, type bar} from 'foo'
import baz from 'baz'
`
      const root = j(code)
      const result = addImports(root, [
        statement`import type {bar, baz} from 'foo'`,
        statement`import blah, {type qux} from 'qux'`,
      ])
      expect(result).to.deep.equal({
        bar: 'bar',
        baz: 'baz1',
        blah: 'blah',
        qux: 'qux',
      })
      expect(root.toSource()).to.equal(`// @flow
import { foo, type bar, type baz as baz1 } from 'foo';
import baz from 'baz'
import blah, { type qux } from "qux";
`)
    })
  })
})
