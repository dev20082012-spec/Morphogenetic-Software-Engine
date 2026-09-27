# Project MSE — System Architecture & Component Specification

## 1. Architectural Overview

The Morphogenetic Software Engine (MSE) is an autonomous software verification and repair system designed to maintain architectural invariants across evolving repositories.

MSE models software systems as biological organisms seeking **homeostasis**:
1. **Perception**: Extracting actual structural reality from source code.
2. **Reconciliation**: Detecting specification drift between documentation, configuration, and implementation.
3. **Disruption Search**: Generating concrete counterexamples demonstrating how invariant violations can be exploited.
4. **Morphogenesis**: Synthesizing atomic code patches to restore invariant compliance.
5. **Immune Proving**: In-memory verification asserting that candidate patches resolve violations without introducing regressions.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             PROJECT MSE PIPELINE                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                         [Repository ZIP / Fixture]
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │     INGESTION LAYER       │
                        │ - Safe ZIP Unpacker       │
                        │ - Path Traversal Filter   │
                        │ - Magic-Bytes Binary Drop │
                        └─────────────┬─────────────┘
                                      │ RepositorySnapshot (RAM)
                                      ▼
                        ┌───────────────────────────┐
                        │     ALPHA ENGINE          │
                        │ - AST & Import Graph      │
                        │ - Route & Auth Mapping    │
                        │ - Environment Var Index   │
                        └─────────────┬─────────────┘
                                      │ AnalysisResult
                                      ▼
                        ┌───────────────────────────┐
                        │     BETA ENGINE           │
                        │ - README Drift Matcher    │
                        │ - Port Reconciliation     │
                        │ - Auth Scheme Discrepancy │
                        └─────────────┬─────────────┘
                                      │ DriftResult
                                      ▼
                        ┌───────────────────────────┐
                        │   INVARIANT MANIFOLD      │
                        │ - Evaluates INV-001..006  │
                        │ - Violated / Satisfied    │
                        └─────────────┬─────────────┘
                                      │ InvariantResult
                                      ▼
                        ┌───────────────────────────┐
                        │     GAMMA ENGINE          │
                        │ - Counterexample Scenarios│
                        │ - Executable Test Antigens│
                        └─────────────┬─────────────┘
                                      │ CounterexampleResult
                                      ▼
                        ┌───────────────────────────┐
                        │     PATCH SYNTHESIZER     │
                        │ - Atomic Unified Diffs    │
                        │ - Guard & Doc Strategies  │
                        └─────────────┬─────────────┘
                                      │ PatchSynthesisResult
                                      ▼
                        ┌───────────────────────────┐
                        │    VERIFICATION KERNEL    │
                        │ - In-Memory Virtual Clone │
                        │ - Re-Audit & Homeostasis  │
                        │ - VERIFIED / FAILED Prover│
                        └─────────────┬─────────────┘
                                      │ VerificationResult
                                      ▼
                        ┌───────────────────────────┐
                        │     REPORT & EXPORT       │
                        │ - Telemetry Event Stream  │
                        │ - JSON / Markdown Audit   │
                        │ - Developer Studio UI     │
                        └───────────────────────────┘
```

---

## 2. Component Specifications

### 2.1 Ingestion Layer (`src/engine/ingest/`)
* **`loadZipRepository(buffer, name)`**: Asynchronously decompresses ZIP archives using JSZip. Enforces security controls:
  - Rejects path traversals (`isDangerousPath()`).
  - Limits archive entries (`MAX_ZIP_ENTRIES = 5000`), total bytes (`MAX_TOTAL_BYTES = 50MB`), and single file sizes (`MAX_SINGLE_FILE_BYTES = 5MB`).
  - Checks binary magic bytes (`hasBinaryMagicBytes()`) and null bytes.
* **`loadEnterpriseFixture()`** & **`loadDemoRepository()`**: In-memory loaders providing deterministic baseline repositories.

### 2.2 Alpha Engine: Repository Graph Analysis (`src/engine/repositoryGraph/`)
* **Lexical & AST Analyzers**:
  - `extractImports()`: Extracts ES module imports, dynamic imports, and CommonJS requires.
  - `extractExports()`: Resolves exported symbols and named functions.
  - `extractRoutes()`: Indexes Express/Connect HTTP routes (`GET`, `POST`, `PUT`, `DELETE`), detecting route-level middleware chains.
  - `extractEnvVars()`: Resolves `process.env` references and detects default values.
* **Graph Builders**:
  - `buildDependencyGraph()`: Creates cross-file relative import directed acyclic graphs (DAGs) using `Object.create(null)` to prevent prototype pollution.
  - `findEntrypoints()`: Identifies application bootstrap files (`server.ts`, `index.js`, `main.js`).

### 2.3 Beta Engine: Document/Code Drift (`src/engine/drift/`)
* **Reconciliation Rules**:
  - Rule 1 (Port Mismatch): Compares service ports declared in README against code defaults.
  - Rule 2 (Configuration Drift): Compares `.env.example` ports against source defaults.
  - Rule 3 (Authentication Scheme Drift): Compares documented authentication schemes (e.g. HMAC) against code implementations (e.g. RS256/RSA).
  - Rule 4 (Unverified Webhook Ingress): Identifies public webhook ingress routes lacking cryptographic signature verification.

### 2.4 Invariant Manifold (`src/engine/invariants/`)
* Formally evaluates 6 core invariants over the snapshot and analysis:
  - `INV-001`: Route authentication guard
  - `INV-002`: API port consistency
  - `INV-003`: Transaction boundary completeness
  - `INV-004`: Webhook signature verification
  - `INV-005`: Environment variable documentation
  - `INV-006`: Auth helper utilization

### 2.5 Gamma Engine: Counterexample Synthesis (`src/engine/counterexample/`)
* For every violated invariant, synthesizes:
  - A human-readable attack scenario.
  - Precise root cause attribution (`file:line`).
  - An executable test antigen formatted for Vitest or Jest.

### 2.6 Patch Synthesizer (`src/engine/patch/`)
* Translates counterexamples into atomic, minimal code repairs:
  - `AUTH_GUARD_INSERTION`: Injects auth middleware into route declarations.
  - `DOC_PORT_RECONCILIATION`: Updates outdated port numbers in documentation.
  - `WEBHOOK_SIGNATURE_GUARD`: Injects HMAC signature verification guards into webhook handlers.
  - `TRANSACTION_ROLLBACK_GUARD`: Injects exception-safe transaction rollback handlers.
* Produces canonical Unified Diffs (`--- a/path` / `+++ b/path`).

### 2.7 Verification Kernel (`src/engine/verify/`)
* Executes an in-memory CEGIS cycle:
  1. Clones the snapshot in volatile RAM.
  2. Applies candidate patches.
  3. Re-runs Alpha structural analysis and Beta drift reconciliation.
  4. Re-evaluates all invariants.
  5. Asserts that violated invariants are resolved and no new violations are introduced.
  6. Emits `status: 'VERIFIED'` if and only if all checks pass.

---

## 3. Data Flow & Memory Model

* **Zero Disk Mutation**: During analysis and verification, files on the host filesystem are never modified. All snapshots and virtual mutations operate exclusively in browser RAM.
* **Deterministic Execution**: Pure functional evaluation ensures that identical inputs produce identical outputs across runs.
