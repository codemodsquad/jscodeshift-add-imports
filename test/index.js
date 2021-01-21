const { describe, it } = require('mocha')
const { expect } = require('chai')
const jscodeshift = require('jscodeshift')
const prettier = require('prettier')

const addImports = require('..')

for (const parser of ['babylon', 'ts']) {
  describe(`with parser: ${parser}`, function () {
    const j = jscodeshift.withParser(parser)
    const { statement, statements } = j.template

    const format = (code) =>
      prettier
        .format(code, {
          parser: parser === 'ts' ? 'typescript' : 'babel',
        })
        .replace(/\n{2,}/gm, '\n')

    function testCase({
      code,
      add: importsToAdd,
      expectedError,
      expectedCode,
      expectedReturn,
    }) {
      const root = j(code)
      const doAdd = () =>
        addImports(
          root,
          typeof importsToAdd === 'string'
            ? statements([importsToAdd])
            : Array.isArray(importsToAdd)
            ? importsToAdd.map((i) =>
                typeof i === 'string' ? statement([i]) : i
              )
            : importsToAdd
        )
      if (expectedError) expect(doAdd).to.throw(expectedError)
      else {
        const result = doAdd()
        if (expectedCode)
          expect(format(root.toSource())).to.equal(format(expectedCode))
        if (expectedReturn) expect(result).to.deep.equal(expectedReturn)
      }
    }

    describe(`addImports`, function () {
      describe(`for require statement`, function () {
        it(`throws if statement contains a non-require declarator`, function () {
          testCase({
            code: `import Baz from 'baz'`,
            add: `const foo = require('baz'), bar = invalid(true)`,
            expectedError: 'statement must be an import or require',
          })
        })
        it(`throws if statement is an ExpressionStatement that's not a require`, function () {
          testCase({
            code: `import Baz from 'baz'`,
            add: `1 + 2`,
            expectedError: 'statement must be an import or require',
          })
        })
        it(`leaves existing non-default imports with alias untouched`, function () {
          testCase({
            code: `import {foo as bar} from 'baz'`,
            add: `const {foo: qux} = require('baz')`,
            expectedCode: `import {foo as bar} from 'baz'`,
            expectedReturn: { qux: 'bar' },
          })
        })
        it(`adds missing non-default imports with alias`, function () {
          testCase({
            code: `import {blah as bar} from 'baz'`,
            add: `const {foo: qux} = require('baz')`,
            expectedCode: `
              import {blah as bar} from 'baz'
              const {foo: qux} = require('baz')
            `,
          })
        })
        it(`leaves existing non-default imports without alias untouched`, function () {
          testCase({
            code: `import {foo} from 'baz'`,
            add: `const {foo: qux} = require('baz')`,
            expectedCode: `import {foo} from 'baz'`,
            expectedReturn: { qux: 'foo' },
          })
        })
        it(`adds missing non-default imports without alias`, function () {
          testCase({
            code: `import {bar} from 'baz'`,
            add: `const {foo: qux} = require('baz')`,
            expectedCode: `
              import {bar} from 'baz'
              const {foo: qux} = require('baz')
            `,
          })
        })
        it(`merges destructuring`, function () {
          testCase({
            code: `const {foo} = require('bar')`,
            add: `const {bar} = require('bar')`,
            expectedCode: `const {foo, bar} = require('bar')`,
          })
        })
        it(`leaves existing non-default requires without alias untouched`, function () {
          testCase({
            code: `const {foo} = require('baz')`,
            add: `const {foo: qux} = require('baz')`,
            expectedCode: `const {foo} = require('baz')`,
            expectedReturn: { qux: 'foo' },
          })
        })
        it(`adds missing non-default requires without alias`, function () {
          testCase({
            code: `const {bar} = require('baz')`,
            add: `const {foo: qux} = require('baz')`,
            expectedCode: `const {bar, foo: qux} = require('baz')`,
            expectedReturn: { qux: 'qux' },
          })
        })
        it(`leaves existing default requires untouched `, function () {
          testCase({
            code: `const foo = require('baz')`,
            add: `const qux = require('baz')`,
            expectedCode: `const foo = require('baz')`,
            expectedReturn: { qux: 'foo' },
          })
        })
        it(`adds missing default requires`, function () {
          testCase({
            code: `const foo = require('foo')`,
            add: `const qux = require('baz')`,
            expectedCode: `
              const qux = require('baz')
              const foo = require('foo')
            `,
          })
        })
        it(`avoids name conflicts`, function () {
          testCase({
            code: `const foo = require('foo')`,
            add: `const foo = require('bar')`,
            expectedCode: `
              const foo1 = require('bar')
              const foo = require('foo')
            `,
            expectedReturn: { foo: 'foo1' },
          })
        })
        it(`avoids name conflicts with ObjectPattern`, function () {
          testCase({
            code: `const {foo} = require('foo')`,
            add: `const {foo} = require('bar')`,
            expectedCode: `
              const {foo: foo1} = require('bar')
              const {foo} = require('foo')
            `,
            expectedReturn: { foo: 'foo1' },
          })
        })
        it(`adds separate declaration if init is MemberExpression`, function () {
          testCase({
            code: `const foo = require('foo').default`,
            add: `const {bar} = require('foo')`,
            expectedCode: `
              const {bar} = require('foo')
              const foo = require('foo').default
            `,
            expectedReturn: { bar: 'bar' },
          })
        })
      })
      describe(`for import statement`, function () {
        it(`leaves existing default imports untouched`, function () {
          testCase({
            code: `import Baz from 'baz'`,
            add: `import Foo from 'baz'`,
            expectedCode: `import Baz from 'baz'`,
            expectedReturn: { Foo: 'Baz' },
          })
        })
        it(`adds missing default imports`, function () {
          testCase({
            code: `import {baz} from 'baz'`,
            add: `import Foo from 'baz'`,
            expectedCode: `import Foo, {baz} from 'baz'`,
          })
        })
        it(`adds missing default imports case 2`, function () {
          testCase({
            code: `import bar from 'bar'`,
            add: `import Foo from 'baz'`,
            expectedCode: `
              import bar from 'bar'
              import Foo from 'baz'
            `,
          })
        })
        it(`leaves existing funky default imports untouched`, function () {
          testCase({
            code: `import {default as Baz} from 'baz'`,
            add: `import {default as Foo} from 'baz'`,
            expectedCode: `import {default as Baz} from 'baz'`,
            expectedReturn: { Foo: 'Baz' },
          })
        })
        it(`adds missing funky default imports`, function () {
          testCase({
            code: `import {baz} from 'baz'`,
            add: `import {default as Foo} from 'baz'`,
            expectedCode: `import {baz, default as Foo} from 'baz'`,
            expectedReturn: { Foo: 'Foo' },
          })
        })
        it(`adds missing funky default imports case 2`, function () {
          testCase({
            code: `import {bar} from 'bar'`,
            add: `import {default as Foo} from 'baz'`,
            expectedCode: `
              import {bar} from 'bar'
              import { default as Foo } from "baz"
            `,
          })
        })
        it(`leaves existing non-default import specifiers with aliases untouched`, function () {
          testCase({
            code: `import {foo as bar} from 'baz'`,
            add: `import {foo as qux} from 'baz'`,
            expectedCode: `import {foo as bar} from 'baz'`,
          })
        })
        it(`adds missing non-default import specifiers with aliases`, function () {
          testCase({
            code: `import {qlob as bar} from 'baz'`,
            add: `import {foo as qux} from 'baz'`,
            expectedCode: `import { qlob as bar, foo as qux } from 'baz';`,
          })
        })
        it(`adds missing non-default import specifiers with aliases case 2`, function () {
          testCase({
            code: `import {qlob as bar} from 'bar'`,
            add: `import {foo as qux} from 'foo'`,
            expectedCode: `
              import {qlob as bar} from 'bar'
              import {foo as qux} from 'foo'
            `,
          })
        })
        it(`leaves existing non-default import type specifiers with aliases untouched`, function () {
          testCase({
            code: `
              import {foo as bar} from 'baz'
              import type {foo as qlob} from 'baz'
            `,
            add: `import type {foo as qux} from 'baz'`,
            expectedCode: `
              import {foo as bar} from 'baz'
              import type {foo as qlob} from 'baz'
            `,
          })
        })
        it(`adds missing non-default import type specifiers with aliases`, function () {
          testCase({
            code: `
              import {foo as bar} from 'baz'
              import type {glab as qlob} from 'baz'
            `,
            add: `import type {foo as qux} from 'baz'`,
            expectedCode: `
              import {foo as bar} from 'baz'
              import type { glab as qlob, foo as qux } from 'baz'
            `,
          })
        })
        it(`adds missing non-default import type specifiers with aliases case 2`, function () {
          testCase({
            code: `
              import {foo as bar} from 'baz'
              import type { glab as qlob } from "qlob"
            `,
            add: `import type {foo as qux} from 'baz'`,
            expectedCode: `
              import { foo as bar } from 'baz'
              import type { glab as qlob } from "qlob"
              import type { foo as qux } from 'baz'
            `,
          })
        })
        it(`doesn't convert import type {} to import {type} right now`, function () {
          testCase({
            code: `import type {foo as bar} from 'baz'`,
            add: `import {foo as qux} from 'baz'`,
            expectedCode: `
                import type {foo as bar} from 'baz'
                import {foo as qux} from 'baz'
              `,
          })
        })
        it(`leaves existing non-default import specifiers without aliases untouched`, function () {
          testCase({
            code: `import {foo} from 'baz'`,
            add: `import {foo} from 'baz'`,
            expectedCode: `import {foo} from 'baz'`,
          })
        })
        it(`adds missing non-default import specifiers without aliases`, function () {
          testCase({
            code: `import {baz} from 'baz'`,
            add: `import {foo} from 'baz'`,
            expectedCode: `import { baz, foo } from 'baz'`,
          })
        })
        it(`adds missing non-default import specifiers without aliases case 2`, function () {
          testCase({
            code: `import {baz} from 'baz'`,
            add: `import {foo} from 'foo'`,
            expectedCode: `
              import {baz} from 'baz'
              import {foo} from 'foo'
            `,
          })
        })
        it(`leaves existing non-default require specifiers with aliases untouched`, function () {
          testCase({
            code: `const {foo: bar} = require('baz')`,
            add: `import {foo} from 'baz'`,
            expectedCode: `const {foo: bar} = require('baz')`,
          })
        })
        it(`adds missing non-default require specifiers with aliases`, function () {
          testCase({
            code: `const {bar} = require('baz')`,
            add: `import {foo} from 'baz'`,
            expectedCode: `
              import {foo} from 'baz'
              const {bar} = require('baz')
            `,
          })
        })
        it(`leaves existing namespace imports untouched`, function () {
          testCase({
            code: `import * as React from 'react'`,
            add: `import * as R from 'react'`,
            expectedCode: `import * as React from 'react'`,
          })
        })
        it(`adds missing namespace imports`, function () {
          testCase({
            code: `import R from 'react'`,
            add: `import * as React from 'react'`,
            expectedCode: `import R, * as React from 'react'`,
          })
        })
        it(`leaves existing require defaults with commonjs: false untouched`, function () {
          testCase({
            code: `const bar = require('foo').default`,
            add: `import foo from 'foo'`,
            commonjs: false,
            expectedCode: `const bar = require('foo').default`,
          })
        })
        it(`adds missing require defaults with commonjs: false`, function () {
          testCase({
            code: `const {bar} = require('foo').default`,
            add: `import foo from 'foo'`,
            commonjs: false,
            expectedCode: `
              import foo from 'foo'
              const {bar} = require('foo').default
            `,
          })
        })
        it(`leaves existing destructured require defaults with commonjs: false untouched`, function () {
          testCase({
            code: `const {default: bar} = require('foo')`,
            add: `import foo from 'foo'`,
            commonjs: false,
            expectedCode: `const {default: bar} = require('foo')`,
          })
        })
        it(`adds missing destructured require defaults with commonjs: false`, function () {
          testCase({
            code: `const {default: bar} = require('bar')`,
            add: `import foo from 'foo'`,
            commonjs: false,
            expectedCode: `
              import foo from 'foo'
              const {default: bar} = require('bar')
            `,
          })
        })
        it(`leaves existing require defaults with commonjs: true untouched`, function () {
          testCase({
            code: `const bar = require('foo')`,
            add: `import foo from 'foo'`,
            commonjs: true,
            expectedCode: `const bar = require('foo')`,
          })
        })
        it(`adds missing require defaults with commonjs: true`, function () {
          testCase({
            code: `const bar = require('bar')`,
            add: `import foo from 'foo'`,
            commonjs: true,
            expecctedCode: `
              import foo from 'foo'
              const bar = require('bar')
            `,
          })
        })
        it(`avoids name conflicts`, function () {
          testCase({
            code: `import foo from 'foo'`,
            add: `import foo from 'bar'`,
            expectedCode: `
              import foo from 'foo'
              import foo1 from 'bar'
            `,
          })
        })
        it(`avoids name conflicts with import type`, function () {
          testCase({
            code: `
              import type foo from 'foo'
            `,
            add: `import type foo from 'bar'`,
            expectedCode: `
              import type foo from 'foo'
              import type foo1 from 'bar'
            `,
            expectedReturn: { foo: 'foo1' },
          })
        })
        it(`avoids name conflicts with import type {}`, function () {
          testCase({
            code: `
              import type {foo} from 'foo'
            `,
            add: `import type {foo} from 'bar'`,
            expectedCode: `
              import type {foo} from 'foo'
              import type {foo as foo1} from 'bar'
            `,
            expectedReturn: { foo: 'foo1' },
          })
        })
        if (parser !== 'ts') {
          it(`avoids name conflicts with import {type}`, function () {
            testCase({
              code: `
              // @flow
              import {type foo} from 'foo'
            `,
              add: `import {type foo} from 'bar'`,
              expectedCode: `
              // @flow
              import {type foo} from 'foo'
              import {type foo as foo1} from 'bar'
            `,
              expectedReturn: { foo: 'foo1' },
            })
          })
        }
        it(`doesn't break leading comments`, function () {
          testCase({
            code: `
              // @flow
              /* @flow-runtime enable */
              const bar = 'baz'
            `,
            add: `import foo from 'foo'`,
            expectedCode: `
              // @flow
              /* @flow-runtime enable */
              import foo from 'foo'
              const bar = 'baz'
            `,
          })
        })
        it(`multiple statements and specifiers`, function () {
          testCase({
            code: `
              import {foo, bar} from 'foo'
              import baz from 'baz'
            `,
            add: [
              `import {bar, baz} from 'foo'`,
              `import blah, {qux} from 'qux'`,
            ],
            expectedCode: `
              import {foo, bar, baz as baz1} from 'foo'
              import baz from 'baz'
              import blah, {qux} from 'qux'
            `,
            expectedReturn: {
              bar: 'bar',
              baz: 'baz1',
              blah: 'blah',
              qux: 'qux',
            },
          })
        })
        if (parser !== 'ts') {
          it(`multiple statements and specifiers with types`, function () {
            testCase({
              code: `
              // @flow
              import {foo, type bar} from 'foo'
              import baz from 'baz'
            `,
              add: [
                `import type {bar, baz} from 'foo'`,
                `import blah, {type qux} from 'qux'`,
              ],
              expectedCode: `
              // @flow
              import {foo, type bar, type baz as baz1} from 'foo'
              import baz from 'baz'
              import blah, {type qux} from 'qux'
            `,
              expectedReturn: {
                bar: 'bar',
                baz: 'baz1',
                blah: 'blah',
                qux: 'qux',
              },
            })
          })
        }
        it(`multiple statements and specifiers with types, no specifiers with importKind: 'type'`, function () {
          testCase({
            code: `
              import {foo} from 'foo'
              import type {bar} from 'foo'
              import baz from 'baz'
            `,
            add: [
              `import type {bar, baz} from 'foo'`,
              `import blah from 'qux'`,
              `import type {qux} from 'qux'`,
            ],
            expectedCode: `
              import {foo} from 'foo'
              import type {bar, baz as baz1} from 'foo'
              import baz from 'baz'
              import blah from 'qux'
              import type {qux} from 'qux'
            `,
            expectedReturn: {
              bar: 'bar',
              baz: 'baz1',
              blah: 'blah',
              qux: 'qux',
            },
          })
        })
        describe(`bugs`, function () {
          it(`adding side-effect only imports`, async function () {
            testCase({
              code: '',
              add: `import 'foo'`,
              expectedCode: `import 'foo'`,
            })
            testCase({
              code: `
                import 'bar'
              `,
              add: `import 'foo'`,
              expectedCode: `
                import 'bar'
                import 'foo'
              `,
            })
          })
          it(`doesn't re-add side-effect only import`, async function () {
            testCase({
              code: `import 'foo'`,
              add: `import 'foo'`,
              expectedCode: `import 'foo'`,
            })
            testCase({
              code: `require('foo')`,
              add: `import 'foo'`,
              expectedCode: `require('foo')`,
            })
            testCase({
              code: `require('foo')`,
              add: `
                import 'foo'
                import 'bar'
              `,
              expectedCode: `
                import 'bar'
                require('foo')
              `,
            })
          })
          it(`adding side-effect only requires`, async function () {
            testCase({
              code: '',
              add: `require('foo')`,
              expectedCode: `require('foo')`,
            })
            testCase({
              code: `
                require('bar')
              `,
              add: `require('foo')`,
              expectedCode: `
                require('foo')
                require('bar')
              `,
            })
          })
          it(`doesn't re-add side-effect only require`, async function () {
            testCase({
              code: `require('foo')`,
              add: `require('foo')`,
              expectedCode: `require('foo')`,
            })
            testCase({
              code: `import 'foo'`,
              add: `require('foo')`,
              expectedCode: `import 'foo'`,
            })
            testCase({
              code: `
                require('bar')
              `,
              add: `
                require('foo')
                require('bar')
              `,
              expectedCode: `
                require('foo')
                require('bar')
              `,
            })
          })
          if (parser !== 'ts') {
            it(`import type { foo, type bar }`, function () {
              testCase({
                code: `
                // @flow
                import type {foo} from 'foo'
              `,
                add: `import {type bar} from 'foo'`,
                expectedCode: `
                // @flow
                import type {foo, bar} from 'foo'
              `,
                expectedReturn: { bar: 'bar' },
              })
            })
            it(`import typeof { foo, type bar }`, function () {
              testCase({
                code: `
                // @flow
                import typeof {foo} from 'foo'
              `,
                add: `import {type bar} from 'foo'`,
                expectedCode: `
                // @flow
                import { typeof foo, type bar } from 'foo'
              `,
                expectedReturn: { bar: 'bar' },
              })
            })
            it(`import type { foo, typeof bar }`, function () {
              testCase({
                code: `
                // @flow
                import type {foo} from 'foo'
              `,
                add: `import typeof {bar} from 'foo'`,
                expectedCode: `
                // @flow
                import { type foo, typeof bar } from 'foo'
              `,
                expectedReturn: { bar: 'bar' },
              })
            })
            it(`import type { foo, typeof bar } when definitely flow`, function () {
              testCase({
                code: `
                // @flow
                import type {foo} from 'foo'
                type A = number
              `,
                add: `import typeof {bar} from 'foo'`,
                expectedCode: `
                // @flow
                import { type foo, typeof bar } from 'foo'
                type A = number
              `,
                expectedReturn: { bar: 'bar' },
              })
            })
          }
        })
      })
    })
  })
}
