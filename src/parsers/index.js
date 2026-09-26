/**
 * MSE Parser Registry
 *
 * Multi-language source file parser facade. Each language adapter exposes a
 * uniform interface: parse(source, filePath) -> ParseResult.
 *
 * This module is the single import point for all language-specific parsers.
 * Extend by registering a new LanguageAdapter here.
 */

import { JavaScriptParser } from './javascript.js';
import { TypeScriptParser } from './typescript.js';
import { PythonParser } from './python.js';

/**
 * @typedef {{
 *   language: string,
 *   filePath: string,
 *   nodes: ASTNode[],
 *   imports: ImportEdge[],
 *   exports: ExportEdge[],
 *   functions: FunctionNode[],
 *   classes: ClassNode[],
 *   errors: string[],
 * }} ParseResult
 *
 * @typedef {{ type: string, name?: string, lineStart: number, lineEnd: number, raw: string }} ASTNode
 * @typedef {{ specifier: string, kind: 'static'|'dynamic', lineNumber: number }} ImportEdge
 * @typedef {{ name: string, kind: 'named'|'default'|'re-export', lineNumber: number }} ExportEdge
 * @typedef {{ name: string, async: boolean, params: string[], lineStart: number, lineEnd: number }} FunctionNode
 * @typedef {{ name: string, methods: string[], lineStart: number, lineEnd: number }} ClassNode
 */

const REGISTRY = new Map([
  ['.js',  new JavaScriptParser()],
  ['.mjs', new JavaScriptParser()],
  ['.cjs', new JavaScriptParser()],
  ['.jsx', new JavaScriptParser()],
  ['.ts',  new TypeScriptParser()],
  ['.tsx', new TypeScriptParser()],
  ['.py',  new PythonParser()],
]);

/**
 * Parse a source file using the appropriate language adapter.
 * Falls back gracefully if no adapter is registered for the extension.
 *
 * @param {string} source
 * @param {string} filePath
 * @returns {ParseResult}
 */
export function parseFile(source, filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  const parser = REGISTRY.get(ext);

  if (!parser) {
    return {
      language: 'unknown',
      filePath,
      nodes: [],
      imports: [],
      exports: [],
      functions: [],
      classes: [],
      errors: [`No parser registered for extension '${ext}'`],
    };
  }

  return parser.parse(source, filePath);
}

export { JavaScriptParser, TypeScriptParser, PythonParser };
