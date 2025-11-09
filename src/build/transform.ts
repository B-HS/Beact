import ts from 'typescript'
import { createHash } from 'crypto'

const generateCacheKey = (filename: string, lineNumber: number, varName: string): string => {
    const baseKey = `${filename}_${lineNumber}_${varName}`
    return createHash('md5').update(baseKey).digest('hex').slice(0, 12)
}

export const hasUseClientDirective = (code: string): boolean => {
    const lines = code.split('\n')
    for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed === '"use client"' || trimmed === "'use client'" || trimmed === '"use client";' || trimmed === "'use client';") {
            return true
        }
        if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
            break
        }
    }
    return false
}

export const wrapClientCode = (code: string, filename: string): string => {
    const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const exports = extractExports(code, filename)

    let cleanCode = code.replace(/^["']use client["'];?\s*\n?/m, '')

    for (const exportName of exports.named) {
        const regex = new RegExp(`export\\s+const\\s+${exportName}`, 'g')
        cleanCode = cleanCode.replace(regex, `const __original_${exportName}`)
    }

    if (exports.hasDefault) {
        const defaultExportMatch = cleanCode.match(/export\s+default\s+(\w+)/)
        if (defaultExportMatch && defaultExportMatch[1]) {
            const defaultExportName = defaultExportMatch[1]
            if (exports.named.includes(defaultExportName)) {
                cleanCode = cleanCode.replace(/export\s+default\s+\w+/, `const __original_default = __original_${defaultExportName}`)
            } else {
                cleanCode = cleanCode.replace(/export\s+default\s+/, 'const __original_default = ')
            }
        } else {
            cleanCode = cleanCode.replace(/export\s+default\s+/, 'const __original_default = ')
        }
    }

    let wrappedCode = `const __ClientComponentStub__ = ({ children }: any) => children || null;\n\n`
    wrappedCode += cleanCode + '\n\n'

    for (const exportName of exports.named) {
        wrappedCode += `export const ${exportName} = typeof window === 'undefined' ? __ClientComponentStub__ : __original_${exportName};\n`
    }

    if (exports.hasDefault) {
        wrappedCode += `export default typeof window === 'undefined' ? __ClientComponentStub__ : __original_default;\n`
    }

    return wrappedCode
}

const extractExports = (code: string, filename: string): { named: string[]; hasDefault: boolean } => {
    const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    const namedExports: string[] = []
    let hasDefaultExport = false

    const findExports = (node: ts.Node) => {
        if (ts.isExportAssignment(node) && !node.isExportEquals) {
            hasDefaultExport = true
        }

        if (ts.isFunctionDeclaration(node)) {
            const hasExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
            const isDefault = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)

            if (hasExport && isDefault) {
                hasDefaultExport = true
            } else if (hasExport && node.name) {
                namedExports.push(node.name.text)
            }
        }

        if (ts.isVariableStatement(node)) {
            const hasExport = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)

            if (hasExport) {
                for (const decl of node.declarationList.declarations) {
                    if (ts.isIdentifier(decl.name)) {
                        namedExports.push(decl.name.text)
                    }
                }
            }
        }

        ts.forEachChild(node, findExports)
    }

    findExports(sourceFile)

    return { named: namedExports, hasDefault: hasDefaultExport }
}

export const wrapServerOnlyCode = (code: string, filename: string): string => {
    const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
        return (sourceFile) => {
            const visitor = (node: ts.Node): ts.Node => {
                if (ts.isArrowFunction(node)) {
                    const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
                    const hasDynamicContent = containsDynamicValue(node) || containsProcessEnv(node) || containsAwait(node) || containsFetchCall(node)

                    if (isAsync || hasDynamicContent) {
                        return transformAsyncArrowFunction(node, context, filename, sourceFile)
                    }
                }

                if (ts.isFunctionDeclaration(node)) {
                    const isAsync = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
                    const hasDynamicContent = containsDynamicValue(node) || containsProcessEnv(node) || containsAwait(node) || containsFetchCall(node)

                    if (isAsync || hasDynamicContent) {
                        return transformAsyncFunction(node, context, filename, sourceFile)
                    }
                }

                return ts.visitEachChild(node, visitor, context)
            }

            return ts.visitNode(sourceFile, visitor) as ts.SourceFile
        }
    }

    const result = ts.transform(sourceFile, [transformer])
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    const transformed = printer.printFile(result.transformed[0] as ts.SourceFile)
    result.dispose()

    return transformed
}

const transformAsyncArrowFunction = (
    node: ts.ArrowFunction,
    context: ts.TransformationContext,
    filename: string,
    sourceFile: ts.SourceFile,
): ts.Node => {
    if (!node.body || !ts.isBlock(node.body)) {
        return node
    }

    const hoistedDeclarations: ts.Statement[] = []
    const awaitStatements: ts.Statement[] = []
    const cacheStores: ts.Statement[] = []
    const otherStatements: ts.Statement[] = []

    for (const statement of node.body.statements) {
        if (
            ts.isVariableStatement(statement) &&
            (containsAwait(statement) || containsProcessEnv(statement) || containsDynamicValue(statement) || containsFetchCall(statement))
        ) {
            const result = splitVariableDeclaration(statement, filename, sourceFile)
            hoistedDeclarations.push(...result.declarations)
            awaitStatements.push(...result.assignments)
            cacheStores.push(...result.cacheStores)
        } else if (containsAwait(statement)) {
            awaitStatements.push(statement)
        } else {
            otherStatements.push(statement)
        }
    }

    if (awaitStatements.length === 0 && cacheStores.length === 0) {
        return node
    }

    const isServerCheck = ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
            ts.factory.createTypeOfExpression(ts.factory.createIdentifier('window')),
            ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            ts.factory.createStringLiteral('undefined'),
        ),
        ts.factory.createBlock([...awaitStatements, ...cacheStores], true),
    )

    const newBody = ts.factory.createBlock([...hoistedDeclarations, isServerCheck, ...otherStatements], true)

    const asyncModifier = ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)
    const modifiers = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
        ? node.modifiers
        : node.modifiers
          ? [...node.modifiers, asyncModifier]
          : [asyncModifier]

    return ts.factory.updateArrowFunction(node, modifiers, node.typeParameters, node.parameters, node.type, node.equalsGreaterThanToken, newBody)
}

const transformAsyncFunction = (
    node: ts.FunctionDeclaration,
    context: ts.TransformationContext,
    filename: string,
    sourceFile: ts.SourceFile,
): ts.Node => {
    if (!node.body) {
        return node
    }

    const hoistedDeclarations: ts.Statement[] = []
    const awaitStatements: ts.Statement[] = []
    const cacheStores: ts.Statement[] = []
    const otherStatements: ts.Statement[] = []

    for (const statement of node.body.statements) {
        if (
            ts.isVariableStatement(statement) &&
            (containsAwait(statement) || containsProcessEnv(statement) || containsDynamicValue(statement) || containsFetchCall(statement))
        ) {
            const result = splitVariableDeclaration(statement, filename, sourceFile)
            hoistedDeclarations.push(...result.declarations)
            awaitStatements.push(...result.assignments)
            cacheStores.push(...result.cacheStores)
        } else if (containsAwait(statement)) {
            awaitStatements.push(statement)
        } else {
            otherStatements.push(statement)
        }
    }

    if (awaitStatements.length === 0 && cacheStores.length === 0) {
        return node
    }

    const isServerCheck = ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
            ts.factory.createTypeOfExpression(ts.factory.createIdentifier('window')),
            ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            ts.factory.createStringLiteral('undefined'),
        ),
        ts.factory.createBlock([...awaitStatements, ...cacheStores], true),
    )

    const newBody = ts.factory.createBlock([...hoistedDeclarations, isServerCheck, ...otherStatements], true)

    const asyncModifier = ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)
    const modifiers = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
        ? node.modifiers
        : node.modifiers
          ? [...node.modifiers, asyncModifier]
          : [asyncModifier]

    return ts.factory.updateFunctionDeclaration(
        node,
        modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        newBody,
    )
}

const splitVariableDeclaration = (
    statement: ts.VariableStatement,
    filename: string,
    sourceFile: ts.SourceFile,
): { declarations: ts.Statement[]; assignments: ts.Statement[]; cacheStores: ts.Statement[] } => {
    const declarations: ts.Statement[] = []
    const assignments: ts.Statement[] = []
    const cacheStores: ts.Statement[] = []

    for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer) {
            declarations.push(
                ts.factory.createVariableStatement(undefined, ts.factory.createVariableDeclarationList([declaration], ts.NodeFlags.Let)),
            )
            continue
        }

        const varName = declaration.name
        if (!ts.isIdentifier(varName)) {
            declarations.push(statement)
            continue
        }

        const lineNumber = sourceFile.getLineAndCharacterOfPosition(declaration.getStart()).line + 1
        const cacheKey = generateCacheKey(filename, lineNumber, varName.text)

        const cacheCheckExpression = ts.factory.createConditionalExpression(
            ts.factory.createBinaryExpression(
                ts.factory.createTypeOfExpression(ts.factory.createIdentifier('window')),
                ts.factory.createToken(ts.SyntaxKind.ExclamationEqualsEqualsToken),
                ts.factory.createStringLiteral('undefined'),
            ),
            ts.factory.createToken(ts.SyntaxKind.QuestionToken),
            ts.factory.createElementAccessChain(
                ts.factory.createPropertyAccessChain(
                    ts.factory.createIdentifier('window'),
                    ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
                    ts.factory.createIdentifier('__BUNACT_PROMISE_CACHE__'),
                ),
                ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
                ts.factory.createStringLiteral(cacheKey),
            ),
            ts.factory.createToken(ts.SyntaxKind.ColonToken),
            ts.factory.createIdentifier('undefined'),
        )

        declarations.push(
            ts.factory.createVariableStatement(
                undefined,
                ts.factory.createVariableDeclarationList(
                    [ts.factory.createVariableDeclaration(varName, undefined, declaration.type, cacheCheckExpression)],
                    ts.NodeFlags.Let,
                ),
            ),
        )

        const needsAwait = containsAwait(declaration) || containsFetchCall(declaration)
        const assignmentExpression = ts.factory.createBinaryExpression(
            varName,
            ts.factory.createToken(ts.SyntaxKind.EqualsToken),
            needsAwait ? ts.factory.createAwaitExpression(declaration.initializer) : declaration.initializer,
        )

        assignments.push(ts.factory.createExpressionStatement(assignmentExpression))

        cacheStores.push(
            ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                    ts.factory.createPropertyAccessExpression(
                        ts.factory.createAsExpression(
                            ts.factory.createIdentifier('globalThis'),
                            ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword),
                        ),
                        ts.factory.createIdentifier('__bunactSetPromiseCacheValue'),
                    ),
                    undefined,
                    [ts.factory.createStringLiteral(cacheKey), varName],
                ),
            ),
        )
    }

    return { declarations, assignments, cacheStores }
}

const containsAwait = (node: ts.Node): boolean => {
    let hasAwait = false

    const visitor = (node: ts.Node): void => {
        if (ts.isAwaitExpression(node)) {
            hasAwait = true
            return
        }
        ts.forEachChild(node, visitor)
    }

    visitor(node)
    return hasAwait
}

const containsProcessEnv = (node: ts.Node): boolean => {
    let hasProcessEnv = false

    const visitor = (node: ts.Node): void => {
        if (ts.isPropertyAccessExpression(node)) {
            const expr = node.expression

            if (
                ts.isPropertyAccessExpression(expr) &&
                ts.isIdentifier(expr.expression) &&
                expr.expression.text === 'process' &&
                ts.isIdentifier(expr.name) &&
                expr.name.text === 'env'
            ) {
                hasProcessEnv = true
                return
            }
        }
        ts.forEachChild(node, visitor)
    }

    visitor(node)
    return hasProcessEnv
}

const containsDynamicValue = (node: ts.Node): boolean => {
    let hasDynamicValue = false

    const visitor = (node: ts.Node): void => {
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Date') {
            hasDynamicValue = true
            return
        }

        if (ts.isCallExpression(node)) {
            const expr = node.expression

            if (ts.isPropertyAccessExpression(expr)) {
                if (ts.isIdentifier(expr.expression) && expr.expression.text === 'Date' && ts.isIdentifier(expr.name) && expr.name.text === 'now') {
                    hasDynamicValue = true
                    return
                }

                if (
                    ts.isIdentifier(expr.expression) &&
                    expr.expression.text === 'Math' &&
                    ts.isIdentifier(expr.name) &&
                    expr.name.text === 'random'
                ) {
                    hasDynamicValue = true
                    return
                }
            }
        }

        ts.forEachChild(node, visitor)
    }

    visitor(node)
    return hasDynamicValue
}

const containsFetchCall = (node: ts.Node): boolean => {
    let hasFetch = false

    const visitor = (node: ts.Node): void => {
        if (ts.isCallExpression(node)) {
            if (ts.isIdentifier(node.expression) && node.expression.text === 'fetch') {
                hasFetch = true
                return
            }
        }

        ts.forEachChild(node, visitor)
    }

    visitor(node)
    return hasFetch
}
