# MSE Living Specification Manifest

**Version:** 1.0.0
**Status:** Active
**Last reconciled:** auto-updated by Subagent Beta on each run

---

## 1. System Identity

Project MSE (Morphogenetic Software Engine) treats a software codebase as an epigenetic biological organism governed by dynamic homeostasis. It computes the mathematical delta across three dimensions -- human intent, executable code, and verifiable proofs -- and autonomously heals software entropy.

---

## 2. Energy Function

```
E(S) = D_intent(I, S) + λ · R_invariant(S) + γ · L_operational(S, E)
```

| Term | Weight | Description |
|------|--------|-------------|
| `D_intent(I, S)` | 1.0 | Divergence between docs and AST |
| `R_invariant(S)` | λ = 0.35 | Penalty for invariant violations |
| `L_operational(S, E)` | γ = 0.25 | Unresolved failing tests |

A score of `0.0` represents full homeostasis.

---

## 3. Subagent Specifications

### Subagent Alpha: The Morphologist

- **Module:** `src/agents/morphologist.js`
- **Function:** `runMorphologist(rootDir, outputPath?)`
- **Input:** Repository root directory path
- **Output:** `discovered_invariants.json` (MorphologistReport schema)
- **Detected invariant types:**
  - `INV-001` SECURITY -- unguarded async state mutation
  - `INV-002` CONCURRENCY -- unbalanced mutex lifecycle
  - `INV-003` DATA_INTEGRITY -- unclosed transaction boundary
  - `INV-004` CORRECTNESS -- synchronous I/O in route handler

### Subagent Beta: The Symbiote

- **Module:** `src/reconciler/index.js`
- **Function:** `reconcile(rootDir, topologyReport)`
- **Input:** rootDir + MorphologistReport
- **Output:** DriftRecord array + docDriftCount
- **Drift categories:**
  - `UNDOCUMENTED_SYMBOL` -- exported symbol absent from all docs
  - `ORPHAN_DOC_REF` -- doc references non-existent export
  - `MISSING_ROUTE_DOC` -- route absent from all OpenAPI specs
  - `STALE_HEADING` -- heading references a removed module

### Subagent Gamma: The Immune Core

- **Module:** `src/cegis/index.js`
- **Function:** `runCegis(discoveredInvariants, outputDir, options?)`
- **Input:** LatentInvariant array from Alpha
- **Output:** Synthesized test files + atomic patch descriptors
- **CEGIS phases:** VERIFY -> FALSIFY -> REPAIR (max 10 iterations by default)

---

## 4. Core Modules

| Module | Responsibility |
|--------|---------------|
| `src/core/orchestrator.js` | Sequences Alpha, Beta, Gamma; emits telemetry |
| `src/core/state-bus.js` | Pub/sub telemetry event bus |
| `src/core/invariant-manifold.js` | Riemannian energy score computation |
| `src/parsers/index.js` | Language adapter registry |
| `src/parsers/javascript.js` | JS/JSX structural parser |
| `src/parsers/typescript.js` | TS/TSX parser (extends JS) |
| `src/parsers/python.js` | Python structural parser |
| `src/ui/` | Dashboard telemetry endpoints (Phase 1) |

---

## 5. Data Schemas

### MorphologistReport (discovered_invariants.json)

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "<ISO8601>",
  "repositoryRoot": "<absolute path>",
  "summary": { ... },
  "entryPoints": ["<relative path>"],
  "routeManifest": [{ "file", "lineNumber", "excerpt", "method" }],
  "componentTopology": [{ "path", "isEntryPoint", "lineCount", "exports", "dependencies", "routes", "asyncBoundaries", "stateMutations", "latentInvariants" }],
  "dependencyGraph": { "<file>": ["<dep>"] },
  "discoveredInvariants": [{ "id", "type", "name", "description", "severity", "affectedFiles", "evidence" }]
}
```

### LatentInvariant

```json
{
  "id": "INV-001",
  "type": "SECURITY | CONCURRENCY | DATA_INTEGRITY | CORRECTNESS",
  "name": "<human-readable name>",
  "description": "<full description>",
  "severity": "CRITICAL | HIGH | MEDIUM | LOW",
  "affectedFiles": ["<relative path>"],
  "evidence": [{ "lineNumber": 0, "excerpt": "<code>" }]
}
```

---

## 6. Invariant Contract

The following invariants are system-level contracts. Any code change that violates them must be rejected at CI:

1. **Authentication before write**: No async state mutation may execute before token validation has been confirmed in the same call chain.
2. **Mutex balance**: Every `acquire()` must have a corresponding `release()` reachable under all exception paths.
3. **Transaction closure**: Every `BEGIN TRANSACTION` must have a reachable `COMMIT` or `ROLLBACK` on all execution paths.
4. **Async I/O in handlers**: Route handlers that perform I/O must use async/await; synchronous blocking I/O is prohibited.

---

## 7. Doc-Drift SLA

| Drift category | Maximum tolerated | Action on breach |
|----------------|-------------------|-----------------|
| Undocumented exported symbols | 0 in `src/core/**` | CI block |
| Missing route documentation | 0 for public routes | CI warning |
| Orphan doc references | < 5 project-wide | Weekly triage |

---

*This manifest is the authoritative source for MSE system contracts. It is reconciled against the live codebase by Subagent Beta on every pipeline run.*
