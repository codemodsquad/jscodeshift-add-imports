const j = require('jscodeshift').withParser('babylon')
const findImports = require('jscodeshift-find-imports')
const traverse = require('@babel/traverse').default

const firstPath = (c) => c.at(0).paths()[0]
const lastPath = (c) => c.at(-1).paths()[0]
const firstNode = (c) => c.at(0).nodes()[0]
const lastNode = (c) => c.at(-1).nodes()[0]

module.exports = function addImports(root, _statements) {
  const statements = Array.isArray(_statements) ? _statements : [_statements]
  const found = findImports(
    root,
    statements.filter((s) => s.type !== 'ExpressionStatement')
  )
  for (const name in found) {
    if (found[name].type === 'Identifier') found[name] = found[name].name
    else delete found[name]
  }

  const definitelyFlow =
    root.find(j.Flow).size() > 0 ||
    root
      .find(j.Comment, (node) => /^@flow(\b|$)/.test(node.value.trim()))
      .size() > 0

  let babelScope
  let astTypeScope = firstPath(root.find(j.Program)).scope.getGlobalScope()
  try {
    traverse(firstNode(root), {
      Program(path) {
        babelScope = path.scope
      },
    })
  } catch (error) {
    // ignore
  }

  const preventNameConflict = babelScope
    ? (_id) => {
        let id = _id
        let count = 1
        while (
          babelScope.getBinding(id) ||
          astTypeScope.lookup(id) ||
          astTypeScope.lookupType(id)
        )
          id = `${_id}${count++}`
        return id
      }
    : (_id) => {
        let id = _id
        let count = 1
        while (astTypeScope.lookup(id) || astTypeScope.lookupType(id)) {
          id = `${_id}${count++}`
        }
        return id
      }

  for (const statement of statements) {
    if (statement.type === 'ImportDeclaration') {
      const { importKind } = statement
      const source = { value: statement.source.value }
      const filter = { source }
      if (!definitelyFlow) filter.importKind = importKind
      if (!statement.specifiers.length) {
        if (!isSourceImported(root, statement.source.value)) {
          addStatements(root, statement)
        }
        continue
      }
      let existing = root.find(j.ImportDeclaration, filter)
      for (let specifier of statement.specifiers) {
        if (found[specifier.local.name]) continue
        const name = preventNameConflict(specifier.local.name)
        found[specifier.local.name] = name
        if (specifier.local.name !== name) {
          specifier = Object.assign({}, specifier)
          if (specifier.type === 'ImportSpecifier') {
            specifier.imported = j.identifier(
              (specifier.imported || specifier.local).name
            )
          }
          specifier.local = j.identifier(name)
        }
        if (existing.size()) {
          const decl = lastNode(existing)
          const specifierImportKind =
            specifier.importKind || importKind || 'value'
          if ((decl.importKind || 'value') !== specifierImportKind) {
            if (decl.importKind.startsWith('type')) {
              for (let existingSpecifier of decl.specifiers) {
                existingSpecifier.importKind = decl.importKind
              }
              decl.importKind = null
            }
            specifier.importKind = specifierImportKind
          } else if (
            decl.importKind !== 'value' &&
            decl.importKind === specifierImportKind
          ) {
            specifier.importKind = null
          }
          decl.specifiers.push(specifier)
        } else {
          const newDeclaration = j.importDeclaration(
            [specifier],
            j.stringLiteral(statement.source.value),
            importKind
          )
          addStatements(root, newDeclaration)
          existing = root.find(j.ImportDeclaration, { source })
        }
      }
    } else if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach((declarator) => {
        let existing
        if (declarator.init.type === 'CallExpression') {
          existing = root.find(j.VariableDeclarator, {
            id: {
              type: declarator.id.type,
            },
            init: {
              type: 'CallExpression',
              callee: { type: 'Identifier', name: 'require' },
              arguments: [{ value: declarator.init.arguments[0].value }],
            },
          })
        }
        if (declarator.id.type === 'ObjectPattern') {
          for (let prop of declarator.id.properties) {
            if (found[prop.value.name]) continue
            const name = preventNameConflict(prop.value.name)
            found[prop.value.name] = name
            if (name !== prop.value.name) {
              prop = j.objectProperty(
                j.identifier(prop.key.name),
                j.identifier(name)
              )
            }
            if (existing.size()) {
              lastNode(existing).id.properties.push(prop)
            } else {
              const newDeclaration = j.variableDeclaration('const', [
                j.variableDeclarator(j.objectPattern([prop]), declarator.init),
              ])
              addStatements(root, newDeclaration)
            }
          }
        } else if (declarator.id.type === 'Identifier') {
          if (!found[declarator.id.name]) {
            const name = preventNameConflict(declarator.id.name)
            found[declarator.id.name] = name
            declarator.id.name = name
            const newDeclaration = j.variableDeclaration('const', [
              j.variableDeclarator(declarator.id, declarator.init),
            ])
            addStatements(root, newDeclaration)
          }
        }
      })
    } else if (statement.type === 'ExpressionStatement') {
      if (isNodeRequireCall(statement.expression)) {
        if (!isSourceImported(root, getSource(statement.expression))) {
          addStatements(root, statement)
        }
      } else {
        throw new Error(`statement must be an import or require`)
      }
    }
  }

  return found
}

function findTopLevelImports(root, predicate = () => true) {
  const program = root.find(j.Program).at(0).paths()[0]
  if (!program) return []
  return j(
    program
      .get('body')
      .filter((p) => p.node.type === 'ImportDeclaration' && predicate(p))
  )
}

function isNodeRequireCall(node) {
  return (
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === 'require' &&
    node.arguments[0] &&
    (node.arguments[0].type === 'StringLiteral' ||
      node.arguments[0].type === 'Literal')
  )
}

function isPathRequireCall(path) {
  return isNodeRequireCall(path.node) && !path.scope.lookup('require')
}

function findTopLevelRequires(root, predicate = () => true) {
  const paths = []
  const program = root.find(j.Program).at(0).paths()[0]
  if (program) {
    program.get('body').each((path) => {
      if (path.node.type === 'ExpressionStatement') {
        const expression = path.get('expression')
        if (isPathRequireCall(expression) && predicate(expression))
          paths.push(expression)
      } else if (path.node.type === 'VariableDeclaration') {
        for (const declaration of path.get('declarations')) {
          const init = declaration.get('init')
          if (isPathRequireCall(init) && predicate(init)) paths.push(init)
        }
      }
    })
  }
  return j(paths)
}

function getSource(node) {
  if (node.type === 'ImportDeclaration') return node.source.value
  if (isNodeRequireCall(node)) {
    const arg = node.arguments[0]
    if (arg && (arg.type === 'Literal' || arg.type === 'StringLiteral'))
      return arg.value
  }
}

function isSourceImported(root, source) {
  const hasSource = (p) => getSource(p.node) === source
  return (
    findTopLevelImports(root, hasSource).size() ||
    findTopLevelRequires(root, hasSource).size()
  )
}

function insertProgramStatement(root, ...statements) {
  const program = root.find(j.Program).at(0).nodes()[0]
  const firstProgramStatement = program.body[0]
  if (firstProgramStatement) {
    for (let field of ['comments', 'leadingComments']) {
      const comments = firstProgramStatement[field]
      if (comments) {
        comments.forEach((c) => {
          delete c.loc
          delete c.start
          delete c.end
          delete c.extra
        })
        statements[0] = Object.assign({}, statements[0], {
          [field]: comments,
        })
        delete firstProgramStatement[field]
        delete program[field]
      }
    }
  }
  program.body.unshift(...statements)
}

function addStatements(root, ...statements) {
  const imports = findTopLevelImports(root)
  if (imports.size()) {
    const last = lastPath(imports)
    for (const statement of statements.reverse()) last.insertAfter(statement)
  } else insertProgramStatement(root, ...statements)
}
