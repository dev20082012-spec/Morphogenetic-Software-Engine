/**
 * Python Parser Adapter
 *
 * Structural extractor for Python source files. Recognises def/async def,
 * class declarations, import statements, and __all__ exports.
 */

/** @typedef {import('./index.js').ParseResult} ParseResult */

const IMPORT_RE     = /^\s*import\s+([^\s#]+)/;
const FROM_IMPORT_RE = /^\s*from\s+([^\s#]+)\s+import/;
const DEF_RE        = /^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/;
const CLASS_RE      = /^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|:)/;
const ALL_RE        = /^\s*__all__\s*=\s*\[([^\]]*)\]/;

export class PythonParser {
  get language() { return 'python'; }

  /**
   * @param {string} source
   * @param {string} filePath
   * @returns {ParseResult}
   */
  parse(source, filePath) {
    const lines = source.split('\n');
    const imports = [];
    const exports = [];
    const functions = [];
    const classes = [];
    const nodes = [];
    const errors = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      const importM = IMPORT_RE.exec(line);
      if (importM) {
        imports.push({ specifier: importM[1], kind: 'static', lineNumber });
        continue;
      }

      const fromM = FROM_IMPORT_RE.exec(line);
      if (fromM) {
        imports.push({ specifier: fromM[1], kind: 'static', lineNumber });
        continue;
      }

      const defM = DEF_RE.exec(line);
      if (defM) {
        const fn = {
          name: defM[1],
          async: /\basync\b/.test(line),
          params: defM[2].split(',').map(p => p.trim()).filter(Boolean),
          lineStart: lineNumber,
          lineEnd: lineNumber,
        };
        functions.push(fn);
        nodes.push({ type: 'FunctionDef', name: defM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        continue;
      }

      const classM = CLASS_RE.exec(line);
      if (classM) {
        const cls = { name: classM[1], methods: [], lineStart: lineNumber, lineEnd: lineNumber };
        classes.push(cls);
        nodes.push({ type: 'ClassDef', name: classM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        continue;
      }

      const allM = ALL_RE.exec(line);
      if (allM) {
        const names = allM[1].split(',').map(n => n.trim().replace(/['"]/g, '')).filter(Boolean);
        for (const name of names) {
          exports.push({ name, kind: 'named', lineNumber });
        }
      }
    }

    return { language: this.language, filePath, nodes, imports, exports, functions, classes, errors };
  }
}
