# Security Policy — Project Morphogenetic Software Engine (MSE)

## 1. Overview & Core Security Philosophy

The Morphogenetic Software Engine (MSE) performs autonomous structural analysis, document/code drift reconciliation, formal invariant evaluation, and counterexample-guided patch synthesis on arbitrary software repositories.

Because MSE ingests third-party, untrusted codebases—including user-uploaded ZIP archives—the platform operates under a non-negotiable architectural invariant:

> **Untrusted Repository Content Is Data Only, Never Executable Code.**

Under no circumstances does MSE ever `eval()`, execute, import, run, or spawn processes from uploaded repository code or scripts. All analysis is strictly static, structural, semantic, and performed exclusively on ephemeral in-memory text representations.

---

## 2. Hardened Attack Surface Mitigations

### 2.1 Repository Ingestion & ZIP Archive Decompression
| Threat | Mitigation Mechanism | Enforced Limits |
| :--- | :--- | :--- |
| **Path Traversal (Zip Slip)** | `isDangerousPath()` rejects any entry containing `..`, leading `/`, Windows drive specifiers (`C:`), UNC paths (`//`, `\\`), encoded sequences (`%2e%2e`), null bytes (`\0`), or prototype pollution tokens (`__proto__`, `constructor`, `prototype`) **prior** to path normalization. | 100% rejected |
| **Decompression Bombs (Zip Bombs)** | Pre-decompression archive header validation limits total entries; streams entries with hard ceilings on aggregate bytes and single-file sizes. | Max 5,000 entries; Max 50 MB total; Max 5 MB per file |
| **Excessive File Flooding** | File counter ceiling stops ingestion gracefully, returning partial results and recording explicit ingestion warnings. | Max 2,000 files |
| **Binary & Executable Injection** | `hasBinaryMagicBytes()` inspects file headers for executable (ELF, PE/MZ, Mach-O, WASM) and media formats (PNG, JPG, GIF, PDF). Initial 4KB scanned for null bytes (`\0`). | Executables & non-text binaries ignored |
| **Hidden & Sensitive Artifacts** | Automatic blocklist ignores `.git`, `node_modules`, `dist`, `build`, `.env.local`, `.cache`, `.vscode`, etc. | Strictly omitted from RAM snapshot |

### 2.2 In-Memory Analysis & Execution Safety
| Threat | Mitigation Mechanism |
| :--- | :--- |
| **Code Injection / Dynamic Eval** | No use of `eval()`, `new Function()`, `setTimeout(string)`, or dynamic `import()` of user data anywhere in the codebase. Verified via static audits and linter rules. |
| **Catastrophic Backtracking (ReDoS)** | Regular expressions run exclusively against line-bounded strings (maximum 4,096 characters per line). Overly long or minified lines are truncated for pattern matching. |
| **Prototype Pollution** | Graph data structures and dependency maps use `Object.create(null)` and validate that object keys cannot overwrite `__proto__`, `constructor`, or `prototype`. |
| **Parser Crashing & DoS** | Per-file parsing is wrapped in fault-tolerant isolation boundaries. A corrupted or malformed file generates a structured `reliability` finding and records a `parseError` while allowing the rest of the repository analysis to complete successfully. |

### 2.3 User Interface & Browser Defense
| Threat | Mitigation Mechanism |
| :--- | :--- |
| **Cross-Site Scripting (XSS)** | React JSX escapes all interpolated text nodes natively. Zero usage of `dangerouslySetInnerHTML` or `innerHTML`. Code views render source lines as text nodes. |
| **Malicious Markdown** | Markdown documentation is rendered through sanitized text formatting without allowing arbitrary HTML or `<script>` tags. |
| **State Mutation Race Conditions** | Asynchronous pipeline invocations maintain an atomic `runIdRef` token. Stale completions from earlier cancelled or replaced audits are discarded before mutating React state. |
| **Component Crash Cascades** | Structured React `ErrorBoundary` wraps center workspace views and verification rails. Unhandled component exceptions render an in-situ recovery card rather than crashing the studio into a blank page. |
| **Unsafe File Downloads** | `sanitizeDownloadFilename()` strips directory separators, traversal tokens, control characters, and enforces strict alphanumeric/dot constraints. MIME types are restricted to `text/plain`, `text/markdown`, `application/json`, and `text/x-diff`. |
| **URL Navigation Attacks** | `isSafeUrl()` validates any navigation links, strictly enforcing `http:` and `https:` schemes and rejecting `javascript:`, `data:`, `vbscript:`, or URLs with embedded credentials. |
| **Sensitive Storage Exposure** | Zero storage of user code or repository files in `localStorage`, `sessionStorage`, or IndexedDB. All snapshot data lives ephemerally in volatile RAM during the browser session. |

---

## 3. Reporting a Vulnerability

If you discover a security issue or vulnerability within Project MSE, please notify the security team:

* **Email**: security@project-mse.internal (or open a confidential GitHub Security Advisory)
* **Response SLA**: Initial triage within 24 hours. Remediation within 72 hours for critical severity findings.
* **Scope**: Includes repository ingestion, static analysis engine, CEGIS verifier, export generators, and developer studio UI.

Please provide a reproduction repository or ZIP archive with detailed steps.
