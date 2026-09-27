import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { loadEnterpriseFixture } from '../src/engine/ingest/enterpriseRepository.js';
import { loadZipRepository } from '../src/engine/ingest/zipLoader.js';
import { runPipeline } from '../src/engine/pipeline.js';
import { sanitizeDownloadFilename } from '../src/utils/securityUtils.js';

describe('Project MSE Complete Product Flow Verification', () => {
  it('executes full end-to-end flow on canonical enterprise fixture', () => {
    // 1. Demo Repository Selection
    const snapshot = loadEnterpriseFixture();
    expect(snapshot.files.length).toBe(9);
    expect(snapshot.metadata.name).toBe('enterprise-payment-core');

    // 2. Run Audit
    const result = runPipeline(snapshot);
    expect(result).toBeDefined();

    // 3. Alpha Results (Repository Graph & Flow)
    expect(result.analysis.repositoryStats.sourceFiles).toBe(6);
    expect(result.analysis.routes.length).toBeGreaterThan(0);
    expect(result.analysis.routes.some(r => r.path === '/webhooks/stripe')).toBe(true);
    expect(result.analysis.dependencies['src/server.ts']).toBeDefined();
    expect(result.analysis.environmentVariables.some(v => v.name === 'PORT')).toBe(true);

    // 4. Beta Drift Results (Spec Drift)
    expect(result.drift.findings.length).toBeGreaterThan(0);
    const portDrift = result.drift.findings.find(f => f.title.includes('Port mismatch') || f.title.includes('port mismatch'));
    expect(portDrift).toBeDefined();
    expect(portDrift.documentationEvidence.length).toBeGreaterThan(0);
    expect(portDrift.sourceEvidence.length).toBeGreaterThan(0);

    const authDrift = result.drift.findings.find(f => f.title.includes('Authentication scheme drift'));
    expect(authDrift).toBeDefined();

    // 5. Gamma Counterexample
    expect(result.counterexamples.counterexamples.length).toBeGreaterThan(0);
    const cx = result.counterexamples.counterexamples.find(c => c.invariantId === 'INV-004');
    expect(cx).toBeDefined();
    expect(cx.testCode).toContain('it(');
    expect(cx.scenario).toBeDefined();
    expect(cx.rootCause).toContain('src/api/webhooks.ts');

    // 6. Generated Patch
    expect(result.patches.patches.length).toBeGreaterThan(0);
    const webhookPatch = result.patches.patches.find(p => p.strategy === 'WEBHOOK_SIGNATURE_GUARD');
    expect(webhookPatch).toBeDefined();
    expect(webhookPatch.diff).toContain('--- a/src/api/webhooks.ts');
    expect(webhookPatch.diff).toContain('+++ b/src/api/webhooks.ts');
    expect(webhookPatch.diff).toContain('verifyWebhookSignature');

    // 7. Verification Prover (PASS)
    expect(result.verification.status).toBe('VERIFIED');
    const passedChecks = result.verification.checks.filter(c => c.status === 'passed').length;
    expect(passedChecks).toBe(result.verification.checks.length);
    expect(result.report.summary.checksPassed).toBe(7);

    // 8. Diff Export formatting
    const header = `# MSE Synthesized Patchset for ${snapshot.metadata.name}\n`;
    const body = result.patches.patches.map(p => `# Patch ${p.id}: ${p.description}\n${p.diff}`).join('\n\n');
    const combinedDiff = header + body;
    expect(combinedDiff).toContain('MSE Synthesized Patchset');
    expect(combinedDiff).toContain('signature verification guard');
    expect(result.patches.patches.some(p => p.strategy === 'WEBHOOK_SIGNATURE_GUARD')).toBe(true);

    // 9. Report Export formatting
    expect(result.report.json.summary).toBeDefined();
    expect(result.report.markdown).toContain('# MSE Analysis Report:');
    expect(result.report.summary.verificationStatus).toBe('VERIFIED');
  });

  it('executes full flow on uploaded repository ZIP', async () => {
    // 1. Construct a valid repository ZIP
    const zip = new JSZip();
    zip.file('package.json', JSON.stringify({ name: 'custom-zip-app', version: '1.0.0' }));
    zip.file('README.md', '# Custom App\nService Port: 3000\nHMAC authentication required for all webhooks');
    zip.file('.env.example', 'PORT=3000\nWEBHOOK_SECRET=secret');
    zip.file('src/config.js', 'const PORT = process.env.PORT || 8080;\nmodule.exports = { PORT };');
    zip.file('src/routes.js', 'const express = require("express");\nconst router = express.Router();\nrouter.post("/webhook", async (req, res) => { res.json({ ok: true }); });\nmodule.exports = router;');
    zip.file('src/server.js', 'const express = require("express");\nconst app = express();\nconst routes = require("./routes");\napp.use(routes);\napp.listen(8080);');

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });

    // 2. Upload / Ingest ZIP
    const snapshot = await loadZipRepository(buffer, 'custom-zip-app');
    expect(snapshot.files.length).toBe(6);
    expect(snapshot.metadata.source).toBe('zip');

    // 3. Analyze Uploaded Snapshot
    const result = runPipeline(snapshot);
    expect(result).toBeDefined();
    expect(result.analysis.repositoryStats.sourceFiles).toBeGreaterThan(0);
    expect(result.drift.findings.length).toBeGreaterThan(0);
    expect(result.verification.status).toBe('VERIFIED');
  });

  it('verifies safe filename generation for exports', () => {
    const rawRepoName = 'my/custom-repo..v1.0';
    const cleanName = sanitizeDownloadFilename(`mse-patches-${rawRepoName}.patch`);
    expect(cleanName).not.toContain('/');
    expect(cleanName).not.toContain('..');
    expect(cleanName.endsWith('.patch')).toBe(true);
  });
});
