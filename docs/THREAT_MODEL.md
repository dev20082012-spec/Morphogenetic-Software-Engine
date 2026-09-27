# Project MSE — System Threat Model

## 1. System Context & Overview

The Morphogenetic Software Engine (MSE) is an autonomous software audit and verification workbench. It ingests software repositories (via bundled fixtures or user-provided ZIP archives), analyzes structural AST graphs, reconciles documentation-to-code drift, evaluates architectural invariants, generates counterexample attack scenarios, synthesizes atomic repair patches, and executes clean in-memory counterexample-guided inductive synthesis (CEGIS) verification.

This document details the threat model, attacker profiles, trust boundaries, STRIDE classification, and defense-in-depth mitigations implemented across the platform.

```
       [Attacker / Untrusted Repositories]
                       │
                       ▼ (ZIP Archive / Raw Files)
 ┌────────────────────────────────────────────────────────┐
 │ TRUST BOUNDARY 1: Ephemeral Ingestion Layer            │
 │ - Zip Slip path traversal filter                       │
 │ - Decompression bomb limits (entries, bytes, ratios)   │
 │ - Binary magic-bytes & null-byte rejection             │
 │ - Ingestion warnings & partial snapshot constructor    │
 └─────────────────────┬──────────────────────────────────┘
                       │ Validated In-Memory Snapshot
                       ▼
 ┌────────────────────────────────────────────────────────┐
 │ TRUST BOUNDARY 2: Autonomous Analysis Engine (RAM)     │
 │ - Pure static analysis (Zero code execution)           │
 │ - ReDoS length bounding (4KB line truncation)          │
 │ - Prototype pollution prevention (Object.create(null)) │
 │ - Per-file fault-tolerant AST parsing                  │
 └─────────────────────┬──────────────────────────────────┘
                       │ AnalysisResult / Findings / Patches
                       ▼
 ┌────────────────────────────────────────────────────────┐
 │ TRUST BOUNDARY 3: Developer Studio Workbench (DOM)     │
 │ - React text-node escaping (No dangerouslySetInnerHTML)│
 │ - Structured Error Boundaries                          │
 │ - Download filename & MIME sanitization                │
 │ - Strict URL validation (No javascript: / data:)       │
 └────────────────────────────────────────────────────────┘
```

---

## 2. Threat Actors & Capabilities

| Actor | Motivation | Capabilities |
| :--- | :--- | :--- |
| **Adversarial Repository Contributor** | Remote code execution, host file extraction, client browser takeover. | Constructs crafted ZIP files with malicious paths (`../`), binary executables disguised as source files, or zip bombs. |
| **Malicious Package Author** | Supply chain compromise, AST parser crash, denial of service. | Introduces deeply nested syntax, massive single-line minified files (ReDoS triggers), or circular relative imports. |
| **XSS / Client-Side Exploiter** | Session hijacking, cross-origin data exfiltration. | Injects script payloads into README markdown, OpenAPI descriptions, or simulated error messages. |

---

## 3. Trust Boundaries & Attack Vectors

### Trust Boundary 1: Ingestion & Archive Unpacking
* **Attack: Zip Slip Path Traversal**
  * *Vector*: ZIP entries with relative paths (`../../../../etc/passwd` or `..\..\Windows\System32\cmd.exe`), percent-encoded traversals (`%2e%2e%2f`), UNC paths (`//evil/share`), or null bytes (`foo.js\0.exe`).
  * *Mitigation*: `isDangerousPath()` inspects raw paths **before** normalization and before prefix stripping. Rejects any entry violating relative confinement.
* **Attack: Decompression Bomb (Zip Bomb)**
  * *Vector*: Archives with high compression ratios (e.g. 1 MB expanding to 10 GB) or millions of empty files designed to exhaust memory.
  * *Mitigation*: Hard limits enforced: Max 5,000 ZIP entries, Max 50 MB total uncompressed size, Max 5 MB per single file. If total entries exceed 5,000, archive is rejected prior to decompression.
* **Attack: Binary / Executable Ingestion**
  * *Vector*: Native binaries (ELF, PE, Mach-O, WASM), images (SVG with embedded scripts, PNG, JPG), or compiled bytecode disguised with text extensions (`exploit.ts`).
  * *Mitigation*: `hasBinaryMagicBytes()` inspects header signatures and scans the initial 4KB for null bytes (`\0`). Non-text entries are logged in `skippedFiles` and omitted from the snapshot.

### Trust Boundary 2: Static Analysis & Synthesis Engine
* **Attack: Untrusted Code Execution**
  * *Vector*: Attempting to execute, run, `require()`, or `import()` code from the analyzed repository.
  * *Mitigation*: Strict architectural rule: Content is data only. Engine utilizes purely static lexical and AST regex scanning. Zero dynamic evaluation (`eval()`, `new Function()`, `vm.runInContext()`).
* **Attack: Regular Expression Denial of Service (ReDoS)**
  * *Vector*: Providing lines with thousands of unclosed delimiters, nested brackets, or long sequences of spaces designed to cause catastrophic backtracking in AST extractors.
  * *Mitigation*: Line length bounding (`line.length > 4096 ? line.slice(0, 4096) : line`) in `findMatchingLines()` and pattern matchers.
* **Attack: Prototype Pollution**
  * *Vector*: Repository with paths named `__proto__`, `constructor`, or `prototype` attempting to overwrite object prototypes during dependency graph generation.
  * *Mitigation*: `buildDependencyGraph` instantiates maps via `Object.create(null)`, rejects reserved keys, and avoids unsafe property merges.
* **Attack: Single-File Parser Crash / Analysis Abort**
  * *Vector*: Corrupt syntax or unsupported language features in one file causing an unhandled exception that aborts analysis of the entire codebase.
  * *Mitigation*: Per-file isolation loop in `analyzeRepository()`. Parser failures are captured into `parseErrors` and emitted as structured `reliability` findings, allowing partial results for remaining valid files.

### Trust Boundary 3: Developer Studio & Browser Interaction
* **Attack: Stored Cross-Site Scripting (XSS)**
  * *Vector*: Embedding `<script>` or `<img onerror=...>` tags in repository source code, documentation, or diff outputs.
  * *Mitigation*: React JSX renders text exclusively through safe DOM text nodes. Zero usage of `dangerouslySetInnerHTML` or `innerHTML`.
* **Attack: Malicious Artifact Download (File Type Deception)**
  * *Vector*: Triggering patch or report downloads with filenames like `../../autoexec.bat` or MIME types like `text/html`.
  * *Mitigation*: `downloadFile()` sanitizes filenames with `sanitizeDownloadFilename()` (stripping path separators, control characters, limiting extensions to `.patch`, `.json`, `.md`) and coerces MIME types to safe non-executable formats (`text/plain`, `application/json`, `text/x-diff`).
* **Attack: UI Race Conditions & Stale State Overwrites**
  * *Vector*: Triggering multiple audits rapidly, causing out-of-order asynchronous state mutations.
  * *Mitigation*: `runIdRef` cancellation token checks discard stale telemetry events and audit completions.
* **Attack: Component Render Crash Cascade**
  * *Vector*: Rendering unexpected data shapes resulting in an unhandled React error that crashes the entire interface.
  * *Mitigation*: React `ErrorBoundary` isolates workspace views and verification consoles, offering in-situ state recovery.

---

## 4. STRIDE Threat Assessment Matrix

| Threat Category | Target Component | Threat Scenario | Implemented Mitigation | Verification Test |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | Route / Auth Analysis | Fabricated route claiming auth middleware | Regex checks require known middleware tokens in route declaration chain. | Unit & immune test suites |
| **Tampering** | Ingestion Snapshot | Modifying internal snapshot properties | Snapshot treated as immutable data structure during analysis phases. | Pure functional pipeline tests |
| **Repudiation** | Telemetry Logs | Missing execution audit trail | Timestamped telemetry events generated for all 7 pipeline stages. | Telemetry event tests |
| **Information Disclosure** | Local Storage / Cache | Exposing user code in browser storage | Zero persistence in `localStorage`, `sessionStorage`, or cookies. Volatile RAM only. | Storage audit tests |
| **Denial of Service** | ZIP Ingestion / AST | Zip bombs, ReDoS, corrupt file crash | Hard entry/size limits, ReDoS line caps, per-file try/catch error boundaries. | `security-hardening.test.js` |
| **Elevation of Privilege**| Host / Browser | Path traversal writing files to disk | Ingestion only creates in-memory objects; `isDangerousPath()` rejects traversal. | `security-hardening.test.js` |

---

## 5. Security Invariants

1. **INV-SEC-01**: An uploaded repository file shall never be executed as host or browser code.
2. **INV-SEC-02**: No file entry whose path escapes its relative repository root shall ever be added to an in-memory snapshot.
3. **INV-SEC-03**: An exception in parsing any single file shall never prevent the analysis of remaining files in the snapshot.
4. **INV-SEC-04**: Generated patch and report downloads shall never contain path traversal characters or executable MIME types.
5. **INV-SEC-05**: Repository data shall never be stored in persistent browser storage mechanisms.
