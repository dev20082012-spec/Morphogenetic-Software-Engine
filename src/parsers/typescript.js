/**
 * TypeScript / TSX Parser Adapter
 *
 * Extends the JavaScript parser with TypeScript-specific constructs:
 * interface declarations, type aliases, enum declarations, and
 * type-annotated function signatures.
 */

import { JavaScriptParser } from './javascript.js';

/** @typedef {import('./index.js').ParseResult} ParseResult */

const INTERFACE_RE  = /^\s*(?:export\s+)?interface\s+([A-Za-z_$][A-Za-z0-9_$<>]*)/;
const TYPE_ALIAS_RE = /^\s*(?:export\s+)?type\s+([A-Za-z_$][A-Za-z0-9_$<>]*)\s*=/;
const ENUM_RE       = /^\s*(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
const DECORATOR_RE  = /^\s*@([A-Za-z_$][A-Za-z0-9_$.]*)\s*(?:\(|$)/;

export class TypeScriptParser extends JavaScriptParser {
  get language() { return 'typescript'; }

  /**
   * @param {string} source
   * @param {string} filePath
   * @returns {ParseResult}
   */
  parse(source, filePath) {
    const base = super.parse(source, filePath);
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      const ifaceM = INTERFACE_RE.exec(line);
      if (ifaceM) {
        base.nodes.push({ type: 'InterfaceDeclaration', name: ifaceM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        base.exports.push({ name: ifaceM[1], kind: 'named', lineNumber });
        continue;
      }

      const typeM = TYPE_ALIAS_RE.exec(line);
      if (typeM) {
        base.nodes.push({ type: 'TypeAlias', name: typeM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        continue;
      }

      const enumM = ENUM_RE.exec(line);
      if (enumM) {
        base.nodes.push({ type: 'EnumDeclaration', name: enumM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        base.exports.push({ name: enumM[1], kind: 'named', lineNumber });
        continue;
      }

      const decoratorM = DECORATOR_RE.exec(line);
      if (decoratorM) {
        base.nodes.push({ type: 'Decorator', name: decoratorM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
      }
    }

    return base;
  }
}
