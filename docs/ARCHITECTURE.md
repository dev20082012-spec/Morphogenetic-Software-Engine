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
                          [Repository ZIP / Fixture / GitHub]
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │     INGESTION LAYER       │
                        │ - Safe ZIP Unpacker       │
                        │ - Path Traversal Filter   │
                        │ - Magic-Bytes Binary Drop │
                        │ - Decompression Bomb Guard│
                        └─────────────┬─────────────┘
                                      │ RepositorySnapshot (RAM)
                                      ▼
                        ┌───────────────────────────┐
                        │     ALPHA ENGINE          │
                        │ - AST & Import Graph      │
                        │ - Route & Auth Mapping    │
                        │ - Environment Var Index   │
                        │ - Blast Radius Traversal  │
                        └─────────────┬─────────────┘
                                      │ AnalysisResult
                                      ▼
                        ┌───────────────────────────┐
                        │     BETA ENGINE           │
                        │ - README Drift Matcher    │
                        │ - Port Reconciliation     │
                        │ - Auth Scheme Discrepancy │
                        │ - Webhook Verification Gap│
                        └─────────────┬─────────────┘
                                      │ DriftResult
                                      ▼
                        ┌───────────────────────────┐
                        │   INVARIANT MANIFOLD      │
                        │ - Evaluates INV-001..006  │
                        │ - Violated / Satisfied    │
                        │ - Line-Level Evidence     │
                        └─────────────┬─────────────┘
                                      │ InvariantResult
                                      ▼
                        ┌───────────────────────────┐
                        │     GAMMA ENGINE          │
                        │ - Counterexample Scenarios│
                        │ - Executable Test Antigens│
                        │ - Root Cause Attribution  │
                        └─────────────┬─────────────┘
                                      │ CounterexampleResult
                                      ▼
                        ┌───────────────────────────┐
                        │     PATCH SYNTHESIZER     │
                        │ - Atomic Unified Diffs    │
                        │ - Guard & Doc Strategies  │
                        │ - Patched Content Gen     │
                        └─────────────┬─────────────┘
                                      │ PatchSynthesisResult
                                      ▼
                        ┌───────────────────────────┐
                        │    VERIFICATION KERNEL    │
                        │ - In-Memory Virtual Clone │
                        │ - Re-Audit & Homeostasis  │
                        │ - VERIFIED / FAILED Prover│
                        │ - 5 Acceptance Checks     │
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
* **`loadGitHubRepository(url)`**: Queries GitHub REST Git Trees API for public repositories, filtering out binaries, dependencies, and files over 300KB into a standard `RepositorySnapshot`.
* **`loadEnterpriseFixture()`** & **`loadDemoRepository()`**: In-memory loaders providing deterministic baseline repositories.

### 2.2 Alpha Engine: Repository Graph Analysis (`src/engine/repositoryGraph/`)
* **Lexical & AST Analyzers**:
  - `extractImports()`: Extracts ES module imports, dynamic imports, and CommonJS requires without forcing arbitrary extensions.
  - `extractExports()`: Resolves exported symbols and named functions.
  - `extractRoutes()`: Indexes Express/Connect HTTP routes (`GET`, `POST`, `PUT`, `DELETE`), detecting route-level middleware chains.
  - `extractEnvVars()`: Resolves `process.env` references and detects default values.
* **Graph Builders**:
  - `buildDependencyGraph()`: Creates cross-file relative import directed acyclic graphs (DAGs) with multi-extension TypeScript support.
  - `findEntrypoints()`: Identifies application bootstrap files (`server.ts`, `index.js`, `main.js`).
* **Blast Radius Engine (`src/engine/repositoryGraph/blastRadius.js`)**:
  - Traverses Alpha dependency graphs and route mounting edges to calculate upstream callers, downstream dependencies, and affected test suites for any finding or target file.

### 2.3 Beta Engine: Document/Code Drift (`src/engine/drift/`)
* **Reconciliation Rules**:
  - Rule 1 (Port Mismatch): Compares service ports declared in README against code defaults.
  - Rule 2 (Configuration Drift): Compares `.env.example` ports against source defaults.
  - Rule 3 (Authentication Scheme Drift): Compares documented authentication schemes (e.g. HMAC) against code implementations (e.g. RS256/RSA).
  - Rule 4 (Unverified Webhook Ingress): Identifies public webhook ingress routes lacking cryptographic signature verification.
* **Deterministic Why**: Derives human-readable explanations directly from code and documentation line evidence.

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
  - A structured attack scenario: Problem, Trigger, Execution Path, Expected Behavior, and Observed Violation.
  - Precise root cause attribution (`file:line`).
  - An executable test antigen formatted for Vitest or Jest.

### 2.6 Patch Synthesizer (`src/engine/patch/`)
* Translates counterexamples into atomic, minimal code repairs:
  - `AUTH_GUARD_INSERTION`: Injects auth middleware into route declarations.
  - `DOC_PORT_RECONCILIATION`: Updates outdated port numbers in documentation.
  - `WEBHOOK_SIGNATURE_GUARD`: Injects HMAC signature verification guards into webhook handlers.
  - `TRANSACTION_ROLLBACK_GUARD`: Injects exception-safe transaction rollback handlers.
* Produces canonical Unified Diffs (`--- a/path` / `+++ b/path`).

### 2.7 Verification Kernel & Verification Gate (`src/engine/verify/`)
* Executes an in-memory CEGIS cycle:
  1. Clones the snapshot in volatile RAM.
  2. Applies candidate patches.
  3. Re-runs Alpha structural analysis and Beta drift reconciliation.
  4. Re-evaluates all invariants.
  5. Asserts that violated invariants are resolved and no new violations are introduced.
  6. Emits the formal **Verification Gate** decision (`VERIFIED`, `REJECTED`, `NEEDS REVIEW`) evaluated against 5 acceptance checks:
     - Original counterexample no longer reproduces
     - Synthesized regression test passes
     - Supported system invariant restored
     - AST syntax & build check passes
     - No newly detected supported violation introduced

### 2.8 Finding Evidence Chain Model (`src/utils/findingsAdapter.js`)
* Stores an unbroken progression for every finding:
  - `findingId`: unique identifier
  - `sourceEvidence`: code lines, file paths, and excerpt context
  - `documentationEvidence`: spec citations
  - `invariant`: linked invariant statement and violation rationale
  - `counterexample`: problem trigger, execution propagation path, and generated Vitest test artifact
  - `patch`: strategy, target file, unified diff, and confidence
  - `verification`: gate decision, passing checks, and post-patch invariant status

### 2.9 Analysis Sessions & Product Memory (`src/utils/sessionManager.js`)
* Records analysis runs into browser `localStorage` with in-memory fallback.
* Each run stores `runId` (e.g. `RUN #001`), repository name, timestamp, duration, findings, patches, and verification outcome with one-click restore.

---

## 3. Data Flow & Memory Model

* **Zero Disk Mutation**: During analysis and verification, files on the host filesystem are never modified. All snapshots and virtual mutations operate exclusively in browser RAM.
* **Deterministic Execution**: Pure functional evaluation ensures that identical inputs produce identical outputs across runs.
* **Security-First**: All untrusted repository content is treated as data only — never executed, evaluated, or dynamically imported.

---

## 4. UI Architecture (`project-mse/src/components/`)

* **App.jsx**: Main application shell managing global state (landing/workspace, repository, pipeline results, navigation, patches, sessions).
* **LandingPage.jsx**: Three ingestion vectors with security notices and loading states.
* **HeaderBar.jsx**: Brand, repository context, telemetry pills, primary actions (Run Analysis, Apply All Patches), Technical Drawer toggle.
* **Sidebar.jsx**: Primary navigation (Overview, Findings, Changes, Runs, Verification, Report, Code Explorer) with badges and repository switcher.
* **CenterWorkspace.jsx**: Mode-based router rendering the active view.
* **Workspace Views**:
  - `OverviewView.jsx`: Executive dashboard with verification gate, metrics, severity breakdown, next steps.
  - `FindingsView.jsx`: Searchable/filterable unified findings list with severity/category pills.
  - `FindingDetailView.jsx`: Trust & Explainability Matrix, Evidence Chain, Blast Radius, Counterexample, Patch Diff, Verification Gate.
  - `ChangeReviewView.jsx`: Unified diff viewer with patch selection, verification checklist, batch apply/revert.
  - `VerificationView.jsx`: Clean VERIFIED/REJECTED visualization with 5 acceptance checks, metrics, invariant health.
  - `ReportView.jsx`: Presentation-ready Markdown/JSON export with copy/download.
  - `SourceView.jsx`: Tabbed code explorer with line highlighting and evidence markers.
  - `RunsView.jsx`: Historical session ledger with one-click restore.
* **TechnicalDrawer.jsx**: Progressive disclosure of Alpha/Beta/Gamma internals, telemetry logs.
* **VerificationConsole.jsx**: Collapsible bottom console with stage telemetry, duration, file counts.

---

## 5. Security Architecture

| Layer | Threat | Mitigation |
|-------|--------|------------|
| Ingestion | Zip Slip / Path Traversal | `isDangerousPath()` rejects `..`, absolute paths, UNC, encoded traversal, null bytes, prototype pollution tokens **before** normalization |
| Ingestion | Decompression Bombs | Pre-flight entry count ceiling (5000), streaming with aggregate (50MB) and per-file (5MB) limits |
| Ingestion | Binary/Executable Injection | `hasBinaryMagicBytes()` scans headers for ELF, PE, Mach-O, WASM, PNG, JPEG, GIF, PDF, ZIP, Java class; 4KB null-byte scan |
| Analysis | Code Injection / Eval | Zero `eval()`, `new Function()`, dynamic `import()` of user data; static regex/lexical analysis only |
| Analysis | ReDoS | `safeRegexExec()` bounds all regex against 4096-char line limits |
| Analysis | Prototype Pollution | `Object.create(null)` for graphs; key validation rejects `__proto__`, `constructor`, `prototype` |
| UI | XSS | React JSX auto-escapes; zero `dangerouslySetInnerHTML`; code views render as text nodes |
| UI | Unsafe Downloads | `sanitizeDownloadFilename()` strips path separators, traversal, control chars; MIME whitelist |
| UI | URL Navigation | `isSafeUrl()` enforces `http:`/`https:` only; rejects `javascript:`, `data:`, credentials |
| Storage | Data Leakage | Zero repository content in `localStorage`/`sessionStorage`/IndexedDB; ephemeral RAM only |

---

## 6. Verification Gate Decision Model

```
┌─────────────────────────────────────────────────────────────┐
│                    MSE VERIFICATION GATE                    │
├─────────────────────────────────────────────────────────────┤
│  INPUT: Patched Snapshot + Original Analysis/Drift/Invariants│
├─────────────────────────────────────────────────────────────┤
│  CHECKS (all must pass for VERIFIED):                       │
│  ✓ 1. Original counterexample no longer reproduces          │
│  ✓ 2. Synthesized regression test passes                    │
│  ✓ 3. Supported system invariant restored                   │
│  ✓ 4. AST syntax & build check passes                       │
│  ✓ 5. No newly detected supported violation introduced      │
├─────────────────────────────────────────────────────────────┤
│  OUTPUT: VERIFIED | REJECTED | NEEDS REVIEW                 │
└─────────────────────────────────────────────────────────────┘
```

**No misleading green states**: If any check fails, status is `REJECTED` with exact failure reasons displayed.