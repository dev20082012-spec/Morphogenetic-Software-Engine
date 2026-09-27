import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import {
  isDangerousPath,
  hasBinaryMagicBytes,
  sanitizeDownloadFilename,
  isSafeUrl,
  escapeHtml,
  safeRegexExec,
} from '../src/utils/securityUtils.js';
import { loadZipRepository } from '../src/engine/ingest/zipLoader.js';
import { analyzeRepository } from '../src/engine/repositoryGraph/index.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { loadEnterpriseFixture } from '../src/engine/ingest/enterpriseRepository.js';

describe('Project MSE Security & Adversarial Hardening Suite', () => {
  describe('1. Path Traversal & Zip Slip Defense', () => {
    it('rejects relative path traversal with forward slashes', () => {
      expect(isDangerousPath('../../etc/passwd')).toBe(true);
      expect(isDangerousPath('foo/../../bar.js')).toBe(true);
      expect(isDangerousPath('../server.js')).toBe(true);
      expect(isDangerousPath('..')).toBe(true);
    });

    it('rejects relative path traversal with Windows backslashes', () => {
      expect(isDangerousPath('..\\..\\Windows\\System32\\cmd.exe')).toBe(true);
      expect(isDangerousPath('src\\..\\..\\secret.key')).toBe(true);
    });

    it('rejects POSIX absolute root paths', () => {
      expect(isDangerousPath('/etc/shadow')).toBe(true);
      expect(isDangerousPath('/var/log/syslog')).toBe(true);
    });

    it('rejects Windows drive absolute paths', () => {
      expect(isDangerousPath('C:\\Windows\\System32')).toBe(true);
      expect(isDangerousPath('c:/Users/admin/AppData')).toBe(true);
      expect(isDangerousPath('D:\\database\\secrets.db')).toBe(true);
    });

    it('rejects UNC paths', () => {
      expect(isDangerousPath('//evil-server/share/payload.js')).toBe(true);
      expect(isDangerousPath('\\\\evil-server\\share\\payload.js')).toBe(true);
    });

    it('rejects percent-encoded directory traversals', () => {
      expect(isDangerousPath('foo/%2e%2e/bar')).toBe(true);
      expect(isDangerousPath('%2e%2e%2f%2e%2e%2fetc%2fpasswd')).toBe(true);
    });

    it('rejects null bytes and control characters', () => {
      expect(isDangerousPath('safe.js\0.exe')).toBe(true);
      expect(isDangerousPath('file\x1f.js')).toBe(true);
    });

    it('rejects prototype pollution paths', () => {
      expect(isDangerousPath('__proto__/pollute.js')).toBe(true);
      expect(isDangerousPath('src/constructor/exploit.js')).toBe(true);
      expect(isDangerousPath('prototype/danger.ts')).toBe(true);
    });

    it('allows clean, valid relative project paths', () => {
      expect(isDangerousPath('src/server.ts')).toBe(false);
      expect(isDangerousPath('package.json')).toBe(false);
      expect(isDangerousPath('specs/api/v1/swagger.yaml')).toBe(false);
      expect(isDangerousPath('.env.example')).toBe(false);
    });
  });

  describe('2. Binary & Executable Detection', () => {
    it('detects ELF executable magic bytes', () => {
      const elf = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
      expect(hasBinaryMagicBytes(elf)).toBe(true);
    });

    it('detects Windows PE MZ executable magic bytes', () => {
      const pe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
      expect(hasBinaryMagicBytes(pe)).toBe(true);
    });

    it('detects Mach-O binary headers', () => {
      const macho = new Uint8Array([0xfe, 0xed, 0xfa, 0xce, 0x00, 0x00, 0x00, 0x00]);
      expect(hasBinaryMagicBytes(macho)).toBe(true);
    });

    it('detects images and PDF binaries', () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
      const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
      const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x35]);
      expect(hasBinaryMagicBytes(png)).toBe(true);
      expect(hasBinaryMagicBytes(jpeg)).toBe(true);
      expect(hasBinaryMagicBytes(gif)).toBe(true);
      expect(hasBinaryMagicBytes(pdf)).toBe(true);
    });

    it('detects null-byte binary payloads inside text-like files', () => {
      const textWithNull = new TextEncoder().encode('export const x = 1;\0evil_binary_payload');
      expect(hasBinaryMagicBytes(textWithNull)).toBe(true);
    });

    it('confirms genuine source code is non-binary', () => {
      const tsCode = new TextEncoder().encode('import express from "express";\nexport const app = express();');
      expect(hasBinaryMagicBytes(tsCode)).toBe(false);
    });
  });

  describe('3. Safe Download & Artifact Generation', () => {
    it('sanitizes malicious filenames preventing path traversal', () => {
      expect(sanitizeDownloadFilename('../../evil.sh')).toBe('evil.sh');
      expect(sanitizeDownloadFilename('..\\..\\AutoRun.inf')).toBe('AutoRun.inf');
      expect(sanitizeDownloadFilename('dir/subdir/report.json')).toBe('report.json');
    });

    it('strips unsafe shell characters and control symbols', () => {
      expect(sanitizeDownloadFilename('patch;rm -rf ;evil.diff')).toBe('patch_rm_-rf__evil.diff');
      expect(sanitizeDownloadFilename('exploit\x00.exe')).toBe('exploit.exe');
      expect(sanitizeDownloadFilename('....evil.diff')).toBe('evil.diff');
    });

    it('returns fallback for empty or completely stripped names', () => {
      expect(sanitizeDownloadFilename('')).toBe('download.txt');
      expect(sanitizeDownloadFilename('..', 'fallback.patch')).toBe('fallback.patch');
    });
  });

  describe('4. Strict URL & HTML Sanitization', () => {
    it('validates safe HTTP and HTTPS URLs', () => {
      expect(isSafeUrl('https://github.com/project-mse')).toBe(true);
      expect(isSafeUrl('http://localhost:8080/health')).toBe(true);
    });

    it('rejects malicious schemes like javascript: and data:', () => {
      expect(isSafeUrl('javascript:alert(document.cookie)')).toBe(false);
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(isSafeUrl('file:///etc/passwd')).toBe(false);
      expect(isSafeUrl('vbscript:msgbox')).toBe(false);
    });

    it('rejects URLs containing embedded credentials', () => {
      expect(isSafeUrl('https://admin:password@evil.com')).toBe(false);
    });

    it('escapes HTML special characters', () => {
      const dirty = '<script>alert("XSS" & \'test\')</script>';
      const safe = escapeHtml(dirty);
      expect(safe).not.toContain('<script>');
      expect(safe).toContain('&lt;script&gt;');
      expect(safe).toContain('&quot;XSS&quot;');
      expect(safe).toContain('&amp;');
      expect(safe).toContain('&#039;test&#039;');
    });
  });

  describe('5. Hardened ZIP Repository Ingestion', () => {
    it('safely rejects zip-slip path traversal entries without crashing', async () => {
      const zip = new JSZip();
      zip.file('src/valid.js', 'export const a = 1;');
      zip.file('../../etc/passwd', 'root:x:0:0:root:/root:/bin/bash');
      zip.file('src/..\\..\\Windows\\System32\\cmd.exe', 'binary');
      zip.file('__proto__/pollute.js', 'Object.prototype.evil = true;');

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const snapshot = await loadZipRepository(buffer, 'adversarial-zip');

      // Only valid.js should be accepted into the snapshot
      expect(snapshot.files.length).toBe(1);
      expect(snapshot.files[0].path).toBe('src/valid.js');

      // Traversal files must be logged in skippedFiles metadata
      expect(snapshot.metadata.skippedFiles.length).toBeGreaterThanOrEqual(3);
      const reasons = snapshot.metadata.skippedFiles.map(s => s.reason);
      expect(reasons).toContain('DANGEROUS_PATH_TRAVERSAL');
    });

    it('safely rejects binary files in ZIPs and logs metadata', async () => {
      const zip = new JSZip();
      zip.file('src/valid.ts', 'export const port = 8080;');
      zip.file('assets/logo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      zip.file('bin/service.exe', new Uint8Array([0x4d, 0x5a, 0x90, 0x00]));

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const snapshot = await loadZipRepository(buffer, 'binary-zip');

      expect(snapshot.files.length).toBe(1);
      expect(snapshot.files[0].path).toBe('src/valid.ts');
      expect(snapshot.metadata.skippedFiles.some(s => s.reason.includes('BINARY') || s.reason.includes('EXTENSION'))).toBe(true);
    });

    it('enforces single-file size ceiling (5 MB)', async () => {
      const zip = new JSZip();
      zip.file('src/normal.js', 'console.log("hello");');
      // Create a 6MB dummy text file
      const hugeContent = 'a'.repeat(6 * 1024 * 1024);
      zip.file('src/oversized.txt', hugeContent);

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      const snapshot = await loadZipRepository(buffer, 'oversized-zip');

      expect(snapshot.files.some(f => f.path === 'src/oversized.txt')).toBe(false);
      expect(snapshot.files.some(f => f.path === 'src/normal.js')).toBe(true);
      expect(snapshot.metadata.skippedFiles.some(s => s.reason === 'OVERSIZED_SINGLE_FILE')).toBe(true);
    });

    it('rejects archive bomb with excessive entry count', async () => {
      const zip = new JSZip();
      // Generate 5001 empty files
      for (let i = 0; i < 5005; i++) {
        zip.file(`file_${i}.txt`, 'x');
      }

      const buffer = await zip.generateAsync({ type: 'arraybuffer' });
      await expect(loadZipRepository(buffer, 'bomb-zip')).rejects.toThrow('maximum entry limit');
    });
  });

  describe('6. Fault-Tolerant AST Parsing & Partial Analysis', () => {
    it('isolates corrupted file and returns partial results rather than failing entire analysis', () => {
      const baseFixture = loadEnterpriseFixture();
      // Inject one malformed file with null content
      const corruptSnapshot = {
        ...baseFixture,
        files: [
          ...baseFixture.files,
          {
            path: 'src/corrupted_module.ts',
            content: null, // Null content would cause .split() crash if unhandled
            language: 'typescript',
          },
        ],
      };

      // analyzeRepository must NOT throw an unhandled exception
      const result = analyzeRepository(corruptSnapshot);

      expect(result).toBeDefined();
      expect(result.files.length).toBeGreaterThan(5);
      expect(result.parseErrors.length).toBe(1);
      expect(result.parseErrors[0].file).toBe('src/corrupted_module.ts');

      // A structured reliability finding must be emitted
      const reliabilityFinding = result.findings.find(f => f.type === 'reliability');
      expect(reliabilityFinding).toBeDefined();
      expect(reliabilityFinding.title).toContain('Parser failure');
    });

    it('runs the full MSE pipeline on a partially degraded snapshot without aborting', () => {
      const baseFixture = loadEnterpriseFixture();
      const corruptSnapshot = {
        ...baseFixture,
        files: [
          ...baseFixture.files,
          {
            path: 'src/broken_syntax.js',
            content: undefined,
            language: 'javascript',
          },
        ],
      };

      const result = runPipeline(corruptSnapshot);

      expect(result.analysis).toBeDefined();
      expect(result.drift).toBeDefined();
      expect(result.invariants).toBeDefined();
      expect(result.patches).toBeDefined();
      expect(result.verification.status).toBe('VERIFIED');
    });
  });

  describe('7. Prototype Pollution & ReDoS Bounding', () => {
    it('prevents prototype pollution in dependency graph', () => {
      const dirtySnapshot = {
        files: [
          { path: '__proto__', content: 'export const x = 1;', language: 'javascript' },
          { path: 'constructor', content: 'export const y = 2;', language: 'javascript' },
          { path: 'prototype', content: 'export const z = 3;', language: 'javascript' },
          { path: 'src/main.js', content: 'import { x } from "../__proto__";', language: 'javascript' },
        ],
        metadata: { name: 'pollution-test', source: 'demo' },
      };

      const result = analyzeRepository(dirtySnapshot);

      // Verify Object prototype has not been polluted
      expect(Object.prototype.polluted).toBeUndefined();
      expect({}.polluted).toBeUndefined();
      expect(result.dependencies).toBeDefined();
    });

    it('bounds regex execution on massive single-line content to protect against ReDoS', () => {
      // 100,000 character single line
      const giantLine = 'import { ' + 'a, '.repeat(20000) + ' } from "module";';
      const regex = /import\s+([\w\s{},$]+)from/g;

      const t0 = performance.now();
      const match = safeRegexExec(regex, giantLine, 4096);
      const elapsed = performance.now() - t0;

      // Must complete in under 50ms without catastrophic backtracking
      expect(elapsed).toBeLessThan(50);
      expect(match).toBeDefined();
    });
  });
});
