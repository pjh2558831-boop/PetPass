import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const allowedRouteExports = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
  "config",
  "dynamic",
  "dynamicParams",
  "fetchCache",
  "generateStaticParams",
  "maxDuration",
  "preferredRegion",
  "revalidate",
  "runtime",
]);

function findRouteFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return findRouteFiles(entryPath);
    }

    return entry.name === "route.ts" ? [entryPath] : [];
  });
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node)
    ? ts
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false
    : false;
}

function collectBindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) {
    return [name.text];
  }

  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : collectBindingNames(element.name),
  );
}

function collectExportNames(routeFile: string): string[] {
  const sourceFile = ts.createSourceFile(
    routeFile,
    readFileSync(routeFile, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  return sourceFile.statements.flatMap((statement) => {
    if (ts.isExportAssignment(statement)) {
      return ["default"];
    }

    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) {
        return ["*"];
      }

      if (ts.isNamedExports(statement.exportClause)) {
        return statement.exportClause.elements.map((element) => element.name.text);
      }

      return [statement.exportClause.name.text];
    }

    if (!hasExportModifier(statement)) {
      return [];
    }

    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.flatMap((declaration) =>
        collectBindingNames(declaration.name),
      );
    }

    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      return statement.name ? [statement.name.text] : ["default"];
    }

    return ["unknown"];
  });
}

describe("Next.js Route Handler exports", () => {
  it("limits every app route module to supported Next.js exports", () => {
    const projectRoot = process.cwd();
    const routeFiles = findRouteFiles(path.join(projectRoot, "app"));
    const invalidExports = routeFiles.flatMap((routeFile) =>
      collectExportNames(routeFile)
        .filter((exportName) => !allowedRouteExports.has(exportName))
        .map(
          (exportName) =>
            `${path.relative(projectRoot, routeFile).replaceAll("\\", "/")}: ${exportName}`,
        ),
    );

    expect(invalidExports).toEqual([]);
  });
});
