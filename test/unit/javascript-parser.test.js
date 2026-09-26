/**
 * Unit Tests: JavaScript Parser
 */
import { describe, it, expect } from 'vitest';
import { JavaScriptParser } from '../../src/parsers/javascript.js';

const parser = new JavaScriptParser();

describe('JavaScriptParser', () => {
  it('detects static import statements', () => {
    const src = `import { foo } from './foo.js';\nimport bar from '../bar.js';`;
    const result = parser.parse(src, 'test.js');
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].specifier).toBe('./foo.js');
    expect(result.imports[0].kind).toBe('static');
    expect(result.imports[1].specifier).toBe('../bar.js');
  });

  it('detects dynamic import() calls', () => {
    const src = `const mod = await import('./dynamic.js');`;
    const result = parser.parse(src, 'test.js');
    expect(result.imports.some(i => i.specifier === './dynamic.js' && i.kind === 'dynamic')).toBe(true);
  });

  it('detects require() calls', () => {
    const src = `const fs = require('node:fs');\nconst path = require('node:path');`;
    const result = parser.parse(src, 'test.js');
    expect(result.imports.some(i => i.specifier === 'node:fs')).toBe(true);
    expect(result.imports.some(i => i.specifier === 'node:path')).toBe(true);
  });

  it('detects named export declarations', () => {
    const src = `export function doWork() {}\nexport const value = 42;`;
    const result = parser.parse(src, 'test.js');
    expect(result.exports.some(e => e.name === 'doWork' && e.kind === 'named')).toBe(true);
    expect(result.exports.some(e => e.name === 'value' && e.kind === 'named')).toBe(true);
  });

  it('detects default export declarations', () => {
    const src = `export default function MyComponent() {}`;
    const result = parser.parse(src, 'test.js');
    expect(result.exports.some(e => e.kind === 'default')).toBe(true);
  });

  it('extracts function declarations', () => {
    const src = `async function fetchData(url, opts) {\n  return fetch(url);\n}`;
    const result = parser.parse(src, 'test.js');
    expect(result.functions.some(f => f.name === 'fetchData' && f.async === true)).toBe(true);
  });

  it('extracts class declarations and their methods', () => {
    const src = `class UserService {\n  constructor() {}\n  async getUser(id) {}\n}`;
    const result = parser.parse(src, 'test.js');
    const cls = result.classes.find(c => c.name === 'UserService');
    expect(cls).toBeDefined();
  });

  it('returns empty arrays for an empty file', () => {
    const result = parser.parse('', 'empty.js');
    expect(result.imports).toHaveLength(0);
    expect(result.exports).toHaveLength(0);
    expect(result.functions).toHaveLength(0);
    expect(result.classes).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});
