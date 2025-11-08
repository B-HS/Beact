import ts from 'typescript'
import { createHash } from 'crypto'

const generateCacheKey = (filename: string, lineNumber: number, varName: string): string => {
    const baseKey = `${filename}_${lineNumber}_${varName}`
    return createHash('md5').update(baseKey).digest('hex').slice(0, 12)
}

export const wrapServerOnlyCode = (code: string, filename: string): string => {
    const sourceFile = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

    let needsImport = false

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
        return (sourceFile) => {
            const visitor = (node: ts.Node): ts.Node => {
                if (ts.isArrowFunction(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
                    needsImport = true
                    return transformAsyncArrowFunction(node, context, filename, sourceFile)
                }

                if (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
                    needsImport = true
                    return transformAsyncFunction(node, context, filename, sourceFile)
                }

                return ts.visitEachChild(node, visitor, context)
            }

            return ts.visitNode(sourceFile, visitor) as ts.SourceFile
        }
    }

    const result = ts.transform(sourceFile, [transformer])
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
    let transformed = printer.printFile(result.transformed[0] as ts.SourceFile)
    result.dispose()

    if (needsImport) {
        const importStatement = `import { setPromiseCacheValue } from '../context/promise'\n`
        transformed = importStatement + transformed
    }

    return transformed
}

const transformAsyncArrowFunction = (
    node: ts.ArrowFunction,
    context: ts.TransformationContext,
    filename: string,
    sourceFile: ts.SourceFile
): ts.Node => {
    if (!node.body || !ts.isBlock(node.body)) {
        return node
    }

    const hoistedDeclarations: ts.Statement[] = []
    const awaitStatements: ts.Statement[] = []
    const cacheStores: ts.Statement[] = []
    const otherStatements: ts.Statement[] = []

    for (const statement of node.body.statements) {
        if (ts.isVariableStatement(statement) && (containsAwait(statement) || containsProcessEnv(statement) || containsDynamicValue(statement))) {
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

    if (awaitStatements.length === 0) {
        return node
    }

    const isServerCheck = ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
            ts.factory.createTypeOfExpression(ts.factory.createIdentifier('window')),
            ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            ts.factory.createStringLiteral('undefined')
        ),
        ts.factory.createBlock([...awaitStatements, ...cacheStores], true)
    )

    const newBody = ts.factory.createBlock([...hoistedDeclarations, isServerCheck, ...otherStatements], true)

    return ts.factory.updateArrowFunction(
        node,
        node.modifiers,
        node.typeParameters,
        node.parameters,
        node.type,
        node.equalsGreaterThanToken,
        newBody
    )
}

const transformAsyncFunction = (
    node: ts.FunctionDeclaration,
    context: ts.TransformationContext,
    filename: string,
    sourceFile: ts.SourceFile
): ts.Node => {
    if (!node.body) {
        return node
    }

    const hoistedDeclarations: ts.Statement[] = []
    const awaitStatements: ts.Statement[] = []
    const cacheStores: ts.Statement[] = []
    const otherStatements: ts.Statement[] = []

    for (const statement of node.body.statements) {
        if (ts.isVariableStatement(statement) && (containsAwait(statement) || containsProcessEnv(statement) || containsDynamicValue(statement))) {
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

    if (awaitStatements.length === 0) {
        return node
    }

    const isServerCheck = ts.factory.createIfStatement(
        ts.factory.createBinaryExpression(
            ts.factory.createTypeOfExpression(ts.factory.createIdentifier('window')),
            ts.factory.createToken(ts.SyntaxKind.EqualsEqualsEqualsToken),
            ts.factory.createStringLiteral('undefined')
        ),
        ts.factory.createBlock([...awaitStatements, ...cacheStores], true)
    )

    const newBody = ts.factory.createBlock([...hoistedDeclarations, isServerCheck, ...otherStatements], true)

    return ts.factory.updateFunctionDeclaration(
        node,
        node.modifiers,
        node.asteriskToken,
        node.name,
        node.typeParameters,
        node.parameters,
        node.type,
        newBody
    )
}

const splitVariableDeclaration = (
    statement: ts.VariableStatement,
    filename: string,
    sourceFile: ts.SourceFile
): { declarations: ts.Statement[]; assignments: ts.Statement[]; cacheStores: ts.Statement[] } => {
    const declarations: ts.Statement[] = []
    const assignments: ts.Statement[] = []
    const cacheStores: ts.Statement[] = []

    for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer) {
            declarations.push(
                ts.factory.createVariableStatement(
                    undefined,
                    ts.factory.createVariableDeclarationList([declaration], ts.NodeFlags.Let)
                )
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
                ts.factory.createStringLiteral('undefined')
            ),
            ts.factory.createToken(ts.SyntaxKind.QuestionToken),
            ts.factory.createElementAccessChain(
                ts.factory.createPropertyAccessChain(
                    ts.factory.createIdentifier('window'),
                    ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
                    ts.factory.createIdentifier('__MEACT_PROMISE_CACHE__')
                ),
                ts.factory.createToken(ts.SyntaxKind.QuestionDotToken),
                ts.factory.createStringLiteral(cacheKey)
            ),
            ts.factory.createToken(ts.SyntaxKind.ColonToken),
            ts.factory.createIdentifier('undefined')
        )

        declarations.push(
            ts.factory.createVariableStatement(
                undefined,
                ts.factory.createVariableDeclarationList(
                    [ts.factory.createVariableDeclaration(varName, undefined, declaration.type, cacheCheckExpression)],
                    ts.NodeFlags.Let
                )
            )
        )

        assignments.push(
            ts.factory.createExpressionStatement(
                ts.factory.createBinaryExpression(
                    varName,
                    ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                    declaration.initializer
                )
            )
        )

        cacheStores.push(
            ts.factory.createExpressionStatement(
                ts.factory.createCallExpression(
                    ts.factory.createIdentifier('setPromiseCacheValue'),
                    undefined,
                    [ts.factory.createStringLiteral(cacheKey), varName]
                )
            )
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

            if (ts.isPropertyAccessExpression(expr) &&
                ts.isIdentifier(expr.expression) &&
                expr.expression.text === 'process' &&
                ts.isIdentifier(expr.name) &&
                expr.name.text === 'env') {
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
        if (ts.isNewExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 'Date') {
            hasDynamicValue = true
            return
        }

        if (ts.isCallExpression(node)) {
            const expr = node.expression

            if (ts.isPropertyAccessExpression(expr)) {
                if (ts.isIdentifier(expr.expression) && expr.expression.text === 'Date' &&
                    ts.isIdentifier(expr.name) && expr.name.text === 'now') {
                    hasDynamicValue = true
                    return
                }

                if (ts.isIdentifier(expr.expression) && expr.expression.text === 'Math' &&
                    ts.isIdentifier(expr.name) && expr.name.text === 'random') {
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
