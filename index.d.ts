import { Statement } from 'jscodeshift'
import { Collection } from 'jscodeshift/src/Collection'

declare function addImports(
  root: Collection<any>,
  statements: Statement | Statement[]
): Record<string, string>
export = addImports
