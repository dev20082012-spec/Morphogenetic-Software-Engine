# Project MSE — Honest Capabilities & Scope Disclosure

## 1. Capabilities Actually Implemented

The following features and capabilities are fully implemented, tested, and operational in Project MSE:

1. **In-Memory Repository Representation**:
   - Safely parses and represents software repositories as immutable in-memory data structures (`RepositorySnapshot`).
   - Supports both bundled canonical fixtures and arbitrary user-uploaded ZIP archives.

2. **Deterministic Structural Analysis (Alpha Engine)**:
   - Lexical and regular-expression based AST extraction of imports, exports, HTTP route registrations, environment variable defaults, async boundaries, state mutations, and database transactions.
   - Cross-file relative dependency DAG generation with prototype pollution defense.

3. **Specification Drift Detection (Beta Engine)**:
   - Detects discrepancies between documentation (`README.md`, OpenAPI specs) and runtime code (e.g. port mismatches, HMAC vs. RS256/RSA authentication scheme discrepancies).

4. **Formal Invariant Manifold**:
   - Deterministic evaluation of 6 architectural invariants (`INV-001` through `INV-006`).
   - Each invariant returns a tri-state classification (`satisfied`, `violated`, `unknown`) with concrete source and documentation line-level evidence.

5. **Counterexample Synthesis (Gamma Engine)**:
   - Generates executable Vitest/Jest unit test antigens demonstrating failure modes for violated invariants.
   - Formulates structured attack scenarios and assigns precise root-cause file and line coordinates.

6. **Atomic Patch Synthesis**:
   - Generates unified diffs for four repair strategies (`AUTH_GUARD_INSERTION`, `DOC_PORT_RECONCILIATION`, `WEBHOOK_SIGNATURE_GUARD`, `TRANSACTION_ROLLBACK_GUARD`).

7. **In-Memory Verification Kernel**:
   - Clones repository snapshots in volatile RAM, applies synthesized patches, re-runs static analysis and drift reconciliation, and re-evaluates all invariants to prove that violations are resolved without introducing regressions.

8. **Developer Studio Workbench**:
   - Responsive dark-mode developer studio with 7 workspace views (`OVERVIEW`, `FINDINGS`, `CHANGES`, `RUNS`, `VERIFICATION`, `REPORT`, `CODE EXPLORER`).
   - Unified diff viewer with syntax highlighting and side-by-side patch application controls.
   - Export utilities for consolidated patch files and Markdown/JSON audit reports.

9. **Security & Reliability Hardening**:
   - Zip Slip path traversal rejection, zip bomb entry and size ceilings, executable/image magic bytes detection, HTML escaping, ReDoS line bounding, prototype pollution prevention, and React error boundaries.

10. **Finding Evidence Chain**:
    - Constructs an unbroken 6-stage model (`FindingEvidenceChain`) linking Finding → Evidence → Invariant → Counterexample → Candidate Patch → Verification.

11. **Alpha Blast Radius & Impact Propagation**:
    - Computes upstream callers, downstream dependencies, and affected test suites from real AST module imports and Express route mounting patterns.

12. **Verification Gate Decision Model**:
    - Enforces a formal tri-state gate (`VERIFIED`, `REJECTED`, `NEEDS REVIEW`) evaluated against 5 acceptance checks without unsubstantiated "mathematical proof" claims.

13. **Analysis Sessions (Runs) & Product Memory**:
    - Browser `localStorage` persistence of analysis runs, metrics, and snapshots with one-click restore.

14. **Public GitHub Repository Ingestion**:
    - Direct ingestion of public GitHub repositories via REST API trees into standard snapshots.

---

## 2. Capabilities NOT Implemented (Future Work)

To maintain complete technical integrity, we explicitly document capabilities that are outside the current scope:

1. **Full Semantic Compilation / Type Checking**:
   - MSE does not run a full TypeScript compiler (`tsc`) or Language Server Protocol (LSP) in the browser. Static analysis is regex/lexical-based rather than a full semantic type checker.

2. **Arbitrary Runtime Code Execution**:
   - MSE intentionally does not execute, sandbox, or run arbitrary user backend servers. Dynamic counterexample execution is generated as standalone test files for external CI runners, not executed as live processes within the browser.

3. **Full Formal Theorem Proving**:
   - Verification is based on static invariant predicates and in-memory AST re-checking. MSE does NOT use SMT solvers (Z3, CVC5) or interactive theorem provers (Coq, Lean, Isabelle).

4. **Multi-Repository Monorepo Graphing**:
   - Cross-repository dependencies or package registries (e.g. querying remote npm/pypi packages) are not resolved. Analysis is confined to files present in the snapshot.

5. **Arbitrary Language Support**:
   - Structural AST and drift rules currently target JavaScript and TypeScript ecosystems. Python, Go, and Rust files are ingested and tracked for statistics, but deep route extraction is optimized for Node.js/Express.

6. **Authentication / Authorization / Teams**:
   - No user accounts, RBAC, or multi-tenancy. This is a single-user developer tool.

7. **Billing / Payments / Subscriptions**:
   - Not applicable. Open-source MIT licensed.

8. **Complex Cloud Infrastructure**:
   - No Kubernetes, serverless functions, or managed services required. Runs as static files on any CDN.

---

## 3. Benchmark Methodology

* **Source of Metrics**: All numbers displayed in MSE (files analyzed, lines of code, routes discovered, duration in milliseconds, memory bytes) derive from direct measurement during execution (`performance.now()`).
* **Hardware Context**: Measured on local development hardware (Windows 11, x86_64, V8 runtime).
* **Timing Variations**: Analysis duration for the canonical fixture is typically between 7 ms and 30 ms depending on CPU load. No synthetic delays or artificial `setTimeout` timers are used to fake work.
* **Reproducibility**: All benchmarks are derived from the deterministic test suite (`npm test`) which runs the exact same pipeline on the exact same fixture.

---

## 4. Claims We Do NOT Make

To maintain strict scientific and engineering honesty:

* **DO NOT CLAIM "Guaranteed Security"**:
  - Static pattern matching catches known invariant violations and common structural flaws, but cannot guarantee the absence of all zero-day vulnerabilities or subtle runtime logic bugs.

* **DO NOT CLAIM "Mathematical Proof of Correctness"**:
  - Invariant satisfaction proves that code complies with MSE's defined invariant predicates. This is an invariant verification check, not a formal mathematical proof of total system correctness.

* **DO NOT CLAIM "AI Agent Magic"**:
  - All analysis rules, invariant predicates, counterexamples, and patch strategies in MSE are deterministic, explainable, and reproducible algorithms, not unpredictable probabilistic hallucinations.

* **DO NOT CLAIM "External Cloud Integrations"**:
  - MSE does not silently send user code to third-party cloud APIs. All analysis runs 100% locally and ephemerally in the browser.

* **DO NOT CLAIM "Industry Average Improvements"**:
  - No comparative benchmarks against other tools, no "99% improvement" claims, no "industry standard" assertions without evidence.

* **DO NOT CLAIM "Zero-Day Discovery"**:
  - MSE detects patterns matching its invariant catalog. It does not perform novel vulnerability research.

* **DO NOT CLAIM "Automatic Production Deployment"**:
  - Patches are generated as unified diffs for human review. MSE does not auto-commit, auto-merge, or auto-deploy.

---

## 5. Security Posture

* **Zero-Trust Ingestion**: All repository content treated as untrusted data. Never executed.
* **Ephemeral Operation**: No persistence of user code to disk, localStorage, or external services.
* **Path Traversal Immunity**: `isDangerousPath()` validates every path before normalization.
* **Binary Rejection**: Magic-byte detection drops executables, images, archives at ingestion.
* **ReDoS Protection**: All regex bounded to 4096 characters per line.
* **XSS Prevention**: React auto-escaping, no `dangerouslySetInnerHTML`, code rendered as text nodes.
* **Safe Downloads**: Filename sanitization, MIME type restrictions.