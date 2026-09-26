/**
 * JavaScript / JSX Parser Adapter
 *
 * Regex-based structural parser for JavaScript source. Extracts functions,
 * classes, imports, and exports without a full AST runtime dependency so the
 * engine stays dependency-free.  The output schema is compatible with the
 * ParseResult typedef in src/parsers/index.js.
 *
 * For deep semantic analysis (e.g., scope resolution), swap the internals for
 * a tree-sitter or @babel/parser binding while keeping the same interface.
 */

/** @typedef {import('./index.js').ParseResult} ParseResult */

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const IMPORT_STATIC_RE  = /^\s*import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/;
const IMPORT_DYNAMIC_RE = /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const REQUIRE_RE        = /(?:^|[^.\w])require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/;

const EXPORT_NAMED_RE   = /^\s*export\s+(?:const|let|var|function|class|async\s+function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/;
const EXPORT_DEFAULT_RE = /^\s*export\s+default\s+(?:function|class)?\s*([A-Za-z_$][A-Za-z0-9_$]*)?/;
const EXPORT_RE_RE      = /^\s*export\s*\{[^}]*\}\s*from\s*['"`]([^'"`]+)['"`]/;
const MODULE_EXPORTS_RE = /^\s*module\.exports\s*=/;

const FUNC_DECL_RE      = /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)/;
const ARROW_FUNC_RE     = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?\(?[^)]*\)?\s*=>/;
const METHOD_RE         = /^\s*(?:async\s+)?(?:static\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*\{/;

const CLASS_RE          = /^\s*(?:export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimParams(raw) {
  return raw.split(',').map(p => p.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export class JavaScriptParser {
  get language() { return 'javascript'; }

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

    let currentClass = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // track brace depth for class scope
      for (const ch of line) {
        if (ch === '{') braceDepth++;
        if (ch === '}') {
          braceDepth--;
          if (currentClass && braceDepth <= currentClass._openDepth) {
            currentClass.lineEnd = lineNumber;
            currentClass = null;
          }
        }
      }

      // static imports
      const staticM = IMPORT_STATIC_RE.exec(line);
      if (staticM) {
        imports.push({ specifier: staticM[1], kind: 'static', lineNumber });
      }

      // require()
      const reqM = REQUIRE_RE.exec(line);
      if (reqM) {
        imports.push({ specifier: reqM[1], kind: 'static', lineNumber });
      }

      // dynamic imports
      let dynM;
      IMPORT_DYNAMIC_RE.lastIndex = 0;
      while ((dynM = IMPORT_DYNAMIC_RE.exec(line)) !== null) {
        imports.push({ specifier: dynM[1], kind: 'dynamic', lineNumber });
      }

      // named exports
      const namedM = EXPORT_NAMED_RE.exec(line);
      if (namedM) {
        exports.push({ name: namedM[1], kind: 'named', lineNumber });
      }

      // default exports
      const defaultM = EXPORT_DEFAULT_RE.exec(line);
      if (defaultM) {
        exports.push({ name: defaultM[1] || 'default', kind: 'default', lineNumber });
      }

      // re-exports
      const reExM = EXPORT_RE_RE.exec(line);
      if (reExM) {
        exports.push({ name: reExM[1], kind: 're-export', lineNumber });
      }

      // module.exports
      if (MODULE_EXPORTS_RE.test(line)) {
        exports.push({ name: 'module.exports', kind: 'named', lineNumber });
      }

      // function declarations
      const funcM = FUNC_DECL_RE.exec(line);
      if (funcM) {
        const fn = {
          name: funcM[1],
          async: /\basync\b/.test(line),
          params: trimParams(funcM[2]),
          lineStart: lineNumber,
          lineEnd: lineNumber,
        };
        functions.push(fn);
        nodes.push({ type: 'FunctionDeclaration', name: funcM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        continue;
      }

      // arrow functions assigned to const/let/var
      const arrowM = ARROW_FUNC_RE.exec(line);
      if (arrowM) {
        const fn = {
          name: arrowM[1],
          async: /\basync\b/.test(line),
          params: [],
          lineStart: lineNumber,
          lineEnd: lineNumber,
        };
        functions.push(fn);
        nodes.push({ type: 'ArrowFunction', name: arrowM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        continue;
      }

      // class declarations
      const classM = CLASS_RE.exec(line);
      if (classM) {
        const cls = { name: classM[1], methods: [], lineStart: lineNumber, lineEnd: lineNumber, _openDepth: braceDepth };
        classes.push(cls);
        currentClass = cls;
        nodes.push({ type: 'ClassDeclaration', name: classM[1], lineStart: lineNumber, lineEnd: lineNumber, raw: line.trim() });
        continue;
      }

      // class methods (only when inside a class)
      if (currentClass) {
        const methodM = METHOD_RE.exec(line);
        if (methodM && !CLASS_RE.test(line) && !FUNC_DECL_RE.test(line)) {
          currentClass.methods.push(methodM[1]);
        }
      }
    }

    return { language: this.language, filePath, nodes, imports, exports, functions, classes, errors };
  }
}
