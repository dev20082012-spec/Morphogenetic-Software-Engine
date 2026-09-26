# Project MSE  -  Web Dashboard UI 

[![React: 19](https://img.shields.io/badge/React-19.2-blue?style=for-the-badge&logo=react)](https://react.dev)
[![Vite: 8](https://img.shields.io/badge/Vite-8.3-purple?style=for-the-badge&logo=vite)](https://vite.dev)
[![Vercel: Ready](https://img.shields.io/badge/Vercel-Deploy%20Ready-black?style=for-the-badge&logo=vercel)](https://vercel.com/new)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](../LICENSE)

The visual telemetry, AST topology inspection, and autonomous repair dashboard for the **Morphogenetic Software Engine (Project MSE)**.

Built with **React 19** and **Vite 8**, this single-page dashboard provides real-time observability and manual override capabilities across all three MSE subagents: **Alpha** (Morphologist), **Beta** (Symbiote), and **Gamma** (Immune Core).

---

##  Dashboard Capabilities

| View | Subagent | Description |
|---|---|---|
| **Topology View** | Subagent Alpha | Interactive repository tree, entry point identification, route manifests, and async execution boundaries. |
| **Invariants View** | Subagent Alpha | Real-time violation table with severity badges (`CRITICAL`, `HIGH`, `MEDIUM`), category tags, and exact code snippet excerpts. |
| **Doc Drift View** | Subagent Beta | Declarative claim reconciliation against AST truth. Highlights port mismatches, undeclared environment variables, and missing authentication schemes alongside intent divergence scores ($D_{\text{intent}}$). |
| **CEGIS View** | Subagent Gamma | Counterexample test inventory and interactive side-by-side / unified diff patch viewer for synthesized atomic repairs. |
| **Pipeline Telemetry** | Core Engine | Live State Bus streaming events, active subagent phase tracking (`ALPHA` $\rightarrow$ `BETA` $\rightarrow$ `GAMMA`), and real-time thermodynamic energy meter $E(S)$. |

---

##  Deployment to Vercel

This dashboard is ready to deploy directly on **Vercel** with zero extra configuration.

### Deploying the Dashboard Subdirectory Directly

If setting Vercel's **Root Directory** to `project-mse`:

1. Import the repository into [Vercel](https://vercel.com/new).
2. Set the **Root Directory** to `project-mse`.
3. Vercel automatically reads [`vercel.json`](./vercel.json):
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **SPA Rewrites**: Automatically routes `/(.*)` to `/index.html`.
4. Click **Deploy**.

### Deploying from Monorepo Root

If deploying from the repository root:
- The root [`../vercel.json`](../vercel.json) orchestrates the build:
  ```json
  {
    "buildCommand": "npm --prefix project-mse install && npm --prefix project-mse run build",
    "outputDirectory": "project-mse/dist",
    "framework": "vite",
    "cleanUrls": true,
    "rewrites": [
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```

---

##  Local Development

### Prerequisites
- **Node.js**: `>= 18.0.0` (Recommended: Node 20 or 24)
- **npm**: `>= 9.0.0`

### Quickstart

```bash
# From inside the project-mse directory:
npm install

# Start Vite HMR dev server at http://localhost:5173
npm run dev

# Build optimized production bundle
npm run build

# Preview production build locally
npm run preview

# Run fast linter (Oxlint)
npm run lint
```

Or from the root directory:

```bash
npm run dev       # Starts dashboard
npm run build     # Builds production bundle
npm run preview   # Previews production bundle
```

---

##  Design System & Aesthetics

- **Color System**: Dark-mode palette optimized for low eye fatigue with curated HSL accent colors:
  - Background: Deep Obsidian (`#0f172a`, `#090d16`)
  - Accent Bio-Green: `#10b981` (homeostasis / green assertions)
  - Antigen Red: `#ef4444` (failing counterexample / red assertions)
  - Drift Warning: `#f59e0b` (documentation mismatch)
  - Invariant Violet: `#8b5cf6` (AST manifold)
- **Typography**: Google Fonts [`Inter`](https://fonts.google.com/specimen/Inter) for clean UI hierarchy and [`JetBrains Mono`](https://fonts.google.com/specimen/JetBrains+Mono) for code diffs and AST nodes.
- **Glassmorphism**: Backdrop blur with high-contrast semi-transparent surfaces.

---

##  License

Licensed under the [MIT License](../LICENSE).
