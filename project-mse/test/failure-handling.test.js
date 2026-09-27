import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { loadZipRepository } from '../src/engine/ingest/zipLoader.js';
import { analyzeRepository } from '../src/engine/repositoryGraph/index.js';
import { analyzeDrift } from '../src/engine/drift/index.js';
import { runPipeline } from '../src/engine/pipeline.js';

describe('Project MSE Failure Handling & Resilience Suite', () => {
  it('1. Handles completely empty ZIP archive gracefully', async () => {
    const zip = new JSZip();
    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    const snapshot = await loadZipRepository(buffer, 'empty-repo');
    expect(snapshot.files).toEqual([]);
    expect(snapshot.metadata.fileCount).toBe(0);

    // Analysis on empty snapshot must not throw
    const analysis = analyzeRepository(snapshot);
    expect(analysis.files).toEqual([]);
    expect(analysis.routes).toEqual([]);
    expect(analysis.findings).toEqual([]);

    // Full pipeline on empty snapshot must complete with zero crashes
    const result = runPipeline(snapshot);
    expect(result).toBeDefined();
    expect(result.verification.status).toBe('VERIFIED');
  });

  it('2. Handles malformed / corrupted ZIP archive gracefully', async () => {
    // Arbitrary corrupted non-ZIP bytes
    const corruptBuffer = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22, 0x33]).buffer;

    await expect(loadZipRepository(corruptBuffer, 'corrupt-repo')).rejects.toThrow();
  });

  it('3. Handles oversized file by skipping and reporting warning', async () => {
    const zip = new JSZip();
    zip.file('src/normal.js', 'console.log("ok");');
    zip.file('src/huge.js', 'x'.repeat(6 * 1024 * 1024)); // 6 MB exceeds 5 MB limit

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const snapshot = await loadZipRepository(buffer, 'oversized-repo');

    expect(snapshot.files.length).toBe(1);
    expect(snapshot.files[0].path).toBe('src/normal.js');
    expect(snapshot.metadata.skippedFiles.some(s => s.reason === 'OVERSIZED_SINGLE_FILE')).toBe(true);
  });

  it('4. Handles unsupported binary and non-text files', async () => {
    const zip = new JSZip();
    zip.file('src/index.js', 'export const name = "test";');
    zip.file('assets/icon.ico', new Uint8Array([0x00, 0x00, 0x01, 0x00]));
    zip.file('bin/daemon', new Uint8Array([0x7f, 0x45, 0x4c, 0x46]));

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const snapshot = await loadZipRepository(buffer, 'unsupported-repo');

    expect(snapshot.files.length).toBe(1);
    expect(snapshot.files[0].path).toBe('src/index.js');
    expect(snapshot.metadata.skippedFiles.length).toBe(2);
  });

  it('5. Handles malformed source syntax without aborting pipeline', () => {
    const snapshot = {
      files: [
        { path: 'src/valid.js', content: 'const PORT = process.env.PORT || 8080;\nexport const port = PORT;', language: 'javascript' },
        { path: 'src/corrupt.js', content: null, language: 'javascript' },
        { path: 'src/bad_syntax.js', content: 'const a = {{{{{{{{{{{', language: 'javascript' },
      ],
      metadata: { name: 'malformed-source-repo', source: 'demo' },
    };

    const analysis = analyzeRepository(snapshot);
    expect(analysis.files.length).toBe(3);
    expect(analysis.parseErrors.length).toBeGreaterThanOrEqual(1);

    const result = runPipeline(snapshot);
    expect(result).toBeDefined();
    expect(result.analysis.repositoryStats.sourceFiles).toBe(3);
  });

  it('6. Handles repository with missing README cleanly', () => {
    const snapshot = {
      files: [
        { path: 'src/server.js', content: 'const express = require("express");\nconst app = express();\napp.listen(8080);', language: 'javascript' },
        { path: 'package.json', content: '{"name": "no-readme"}', language: 'json' },
      ],
      metadata: { name: 'missing-readme-repo', source: 'demo' },
    };

    const analysis = analyzeRepository(snapshot);
    const drift = analyzeDrift(snapshot, analysis);

    expect(drift.stats.readmeFilesScanned).toBe(0);
    expect(drift.findings).toEqual([]);

    const result = runPipeline(snapshot);
    expect(result).toBeDefined();
    expect(result.verification.status).toBe('VERIFIED');
  });

  it('7. Handles repository with missing package.json cleanly', () => {
    const snapshot = {
      files: [
        { path: 'main.py', content: 'from flask import Flask\napp = Flask(__name__)\n@app.route("/health")\ndef health(): return "ok"', language: 'python' },
        { path: 'README.md', content: '# Python Service\nService Port: 8080', language: 'markdown' },
      ],
      metadata: { name: 'missing-package-json-repo', source: 'demo' },
    };

    const result = runPipeline(snapshot);
    expect(result).toBeDefined();
    expect(result.analysis.repositoryStats.totalFiles).toBe(2);
    expect(result.verification.status).toBe('VERIFIED');
  });
});
