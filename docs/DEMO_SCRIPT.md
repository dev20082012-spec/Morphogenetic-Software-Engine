# Project MSE — 90–120 Second Judge Demonstration Script

## The Core Pitch (5 Seconds)

> *"Most AI coding tools are chatbots that write unverified code. Project MSE is a biological software engine that **understands** your architecture, **detects** specification drift, **explains** why with empirical evidence, **challenges** code with synthesized counterexamples, **repairs** the defect, and **verifies** that the fix works—all in volatile RAM."*

---

## Live Walkthrough Timeline (105 Seconds Total)

### 00:00 – 00:15 | Step 1: Ingestion & The Three Inputs
* **Action**: Start on the Landing Page (`http://localhost:5173/`).
* **Visual**: Point out the three supported ingestion vectors:
  1. Built-in Canonical Enterprise Fixture (`enterprise-payment-core`)
  2. Drag-and-drop ZIP archive (with Zip Slip and bomb protection)
  3. Public GitHub Repository URL
* **Script**:
  > *"We start with a repository. You can upload a ZIP, point to any public GitHub repo, or click our built-in enterprise payment fixture. Everything is processed safely in volatile browser memory without executing untrusted code."*
* **Click**: Click **[Analyze Demo Repository]**.

---

### 00:15 – 00:30 | Step 2: Real Autonomous Execution & Executive Overview
* **Action**: Watch the telemetry progress: `INGESTING` → `ANALYZING` → `RECONCILING` → `SEARCHING` → `SYNTHESIZING` → `VERIFYING` → `COMPLETE`.
* **Visual**: Lands on the **Overview** dashboard.
  - Notice the Run ID badge (`RUN #001`).
  - Notice the execution duration (~15–30 ms) deriving from live measurement (`performance.now()`).
  - Notice the **Verification Gate** showing `NEEDS REVIEW (UNAPPLIED CHANGES)`.
* **Script**:
  > *"In under 30 milliseconds, MSE parsed the AST topology, reconciled documentation claims, evaluated system invariants, and synthesized candidate patches. Notice our Verification Gate clearly states 'NEEDS REVIEW' because the code hasn't been repaired yet. We never fake green checks."*

---

### 00:30 – 00:55 | Step 3: Finding Detail, Evidence Chain & Blast Radius
* **Action**: Click **"Review Findings"** in the top navigation, then click on:
  `Unguarded state-mutating route: POST /webhooks/stripe` (or the Webhook Security Finding).
* **Visual**:
  1. **Trust & Explainability Matrix**: Answers WHAT, WHY, WHERE, WHAT COULD BREAK, WHAT MSE CHANGED, and HOW VERIFIED.
  2. **Evidence Chain**: Click through the 6 stages:
     `Finding` → `Source Evidence` → `Invariant` → `Counterexample` → `Candidate Patch` → `Verification`.
  3. **Impact / Blast Radius**:
     Point to the propagation path:
     `src/server.ts` → `src/api/webhooks.ts` → `src/core/ledger.ts` → `tests/existing.test.ts`.
* **Script**:
  > *"Every finding has an unbroken Evidence Chain. Why did MSE flag this? Not because an LLM guessed, but because documentation requires HMAC signature verification, while the code processes payments unguarded.*
  > *Alpha's Blast Radius engine traces the call graph: server mounts webhooks, webhooks call ledger, and the payment test suite is affected."*

---

### 00:55 – 01:20 | Step 4: Gamma Counterexample & Change Review
* **Action**: Scroll to **Gamma Counterexample**, then click **"View Patch Diff"** to jump to the **Changes** view.
* **Visual**:
  1. Structured counterexample scenario with an actual executable Vitest test artifact.
  2. Unified diff showing the atomic repair patch inserting signature verification.
* **Script**:
  > *"Subagent Gamma doesn't just describe the bug—it synthesizes an executable test antigen proving the flaw. In Change Review, we see an atomic, minimal unified diff that restores the contract without collateral breakage."*

---

### 01:20 – 01:40 | Step 5: Verification Gate & Homeostasis
* **Action**: Click **[Apply All Candidate Changes]**.
* **Visual**:
  - The UI applies the patches to the virtual in-memory snapshot.
  - A real verification cycle re-audits the modified AST.
  - Verification Gate badge updates to:
    **`VERIFIED AGAINST MSE CHECKS`** with all 5 acceptance checks passing:
    - ✓ Counterexample resolved and no longer reproduces
    - ✓ Synthesized regression test passes
    - ✓ Supported system invariant restored
    - ✓ AST syntax & build check passes
    - ✓ No newly detected supported violation introduced
  - Overview updates to `HOMEOSTASIS CONVERGED (0 UNVERIFIED)`.
* **Script**:
  > *"With one click, MSE applies the candidate patches in RAM and re-runs the entire verification cycle. The counterexample no longer reproduces, the regression test passes, and the invariant is restored. The codebase has reached homeostasis."*

---

### 01:40 – 01:50 | Step 6: Sessions & Report Export
* **Action**: Click **"Runs"** to show historical session memory (`RUN #001`, `RUN #002`), then click **"Report"**.
* **Visual**: Show presentation-ready Markdown and JSON audit reports with the `Download JSON` and `Export .md` buttons.
* **Script**:
  > *"Runs are safely remembered across sessions. And you can export presentation-ready Markdown or JSON audit reports with full evidence chains, impact graphs, and verified diffs ready for CI/CD."*

---

### 01:50 – 02:00 | Conclusion
* **Script**:
  > *"Project MSE is not a chatbot. It is an autonomous biological software engine that understands, challenges, and verifies software reality. Thank you."*

---

## Key Talking Points (If Judges Ask)

### "How is this different from Copilot/Cursor?"
> Copilot generates code. MSE **verifies** code against architectural invariants. It doesn't guess—it proves. Every finding has a deterministic evidence chain from source code to specification to counterexample to patch to verification gate.

### "What if the patch is wrong?"
> The Verification Gate catches it. If a patch introduces a new invariant violation or fails to resolve the counterexample, the gate shows **REJECTED** with exact failure reasons. No misleading green states.

### "Does this work on my codebase?"
> Yes. Upload a ZIP or point to a public GitHub repo. MSE ingests safely (Zip Slip protection, binary dropping, size limits), analyzes in-memory, and produces the same evidence-chain findings.

### "Is this just static analysis?"
> It's **structural analysis + specification reconciliation + CEGIS synthesis + in-memory verification**. The verification kernel re-runs the entire pipeline on the patched AST to prove homeostasis.

### "Can I trust the results?"
> All analysis is deterministic. Run it 10 times—same findings, same counterexamples, same patches, same verification outcome. No AI hallucination, no probabilistic guessing.

---

## Fallback Plan (If Live Demo Fails)

1. **Pre-recorded screenshots** in `docs/screenshots/` showing each stage.
2. **Test suite output** showing 331 tests passing (`npm test`).
3. **Expected audit JSON** in `fixtures/enterprise-payment-core/expected-audit.json` with canonical results.
4. **Local preview** of production build (`npm run preview`) if dev server has issues.

---

## Demo Environment Checklist

- [ ] `npm run dev` running on `http://localhost:5173`
- [ ] Browser window sized for visibility (1920x1080 recommended)
- [ ] DevTools closed (clean UI)
- [ ] No other tabs loading heavy resources
- [ ] Screenshots folder accessible as backup
- [ ] Test suite verified passing (`npm test` = 331 PASS)