const j = require('jscodeshift').withParser('babylon')
const findImports = require('jscodeshift-find-imports')
const traverse = require('@babel/traverse').default

const firstPath = c => c.at(0).paths()[0]
const lastPath = c => c.at(-1).paths()[0]
const firstNode = c => c.at(0).nodes()[0]
const lastNode = c => c.at(-1).nodes()[0]

module.exports = function addImports(root, _statements) {
  const found = findImports(root, _statements)

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
  const statements = Array.isArray(_statements) ? _statements : [_statements]

  const preventNameConflict = babelScope
    ? _id => {
        let id = _id
        let count = 1
        while (babelScope.getBinding(id)) id = `${_id}${count++}`
        return id
      }
    : _id => {
        let id = _id
        let count = 1
        while (astTypeScope.lookup(id) || astTypeScope.lookupType(id)) {
          id = `${_id}${count++}`
        }
        return id
      }

  statements.forEach(statement => {
    if (statement.type === 'ImportDeclaration') {
      const { importKind } = statement
      const source = { value: statement.source.value }
      let existing = root.find(j.ImportDeclaration, { source })
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
          const allImports = root.find(j.ImportDeclaration)
          if (allImports.size()) {
            lastPath(allImports).insertAfter(newDeclaration)
          } else {
            insertProgramStatement(root, newDeclaration)
          }
          existing = root.find(j.ImportDeclaration, { source })
        }
      }
    } else if (statement.type === 'VariableDeclaration') {
      statement.declarations.forEach(declarator => {
        let existing
        if (declarator.init.type === 'CallExpression') {
          existing = root.find(j.VariableDeclarator, {
            id: {
              type: declarator.id.type,
            },
            init: {
              type: 'CallExpression',
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
              const allImports = root.find(j.ImportDeclaration)
              if (allImports.size()) {
                lastPath(allImports).insertAfter(newDeclaration)
              } else {
                insertProgramStatement(root, newDeclaration)
              }
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
            const allImports = root.find(j.ImportDeclaration)
            if (allImports.size()) {
              lastPath(allImports).insertAfter(newDeclaration)
            } else {
              insertProgramStatement(root, newDeclaration)
            }
          }
        }
      })
    }
  })

  return found
}

function insertProgramStatement(root, ...statements) {
  const program = root
    .find(j.Program)
    .at(0)
    .nodes()[0]
  const firstProgramStatement = program.body[0]
  if (firstProgramStatement) {
    for (let field of ['comments', 'leadingComments']) {
      const comments = firstProgramStatement[field]
      if (comments) {
        comments.forEach(c => {
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
