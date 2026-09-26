import { useState, useEffect, useRef } from 'react'
import './App.css'

// ---------------------------------------------------------------------------
// Static simulation data -- mirrors discovered_invariants.json schema
// ---------------------------------------------------------------------------

const MOCK_REPORT = {
  summary: {
    totalFilesScanned: 42,
    entryPointCount: 2,
    routeCount: 14,
    asyncBoundaryCount: 37,
    stateMutationCount: 89,
    invariantViolations: 3,
    criticalViolations: 2,
  },
  entryPoints: ['src/index.js', 'src/server.js'],
  discoveredInvariants: [
    {
      id: 'INV-001',
      type: 'SECURITY',
      name: 'Unguarded Async State Mutation',
      severity: 'CRITICAL',
      affectedFiles: ['src/routes/users.js'],
      evidence: [
        { lineNumber: 15, excerpt: 'const user = await db.users.create(req.body);' },
        { lineNumber: 44, excerpt: 'await db.users.update(id, payload);' },
      ],
    },
    {
      id: 'INV-003',
      type: 'DATA_INTEGRITY',
      name: 'Unclosed Transaction Boundary',
      severity: 'CRITICAL',
      affectedFiles: ['src/db/transaction.js'],
      evidence: [{ lineNumber: 12, excerpt: "await pool.query('BEGIN');" }],
    },
    {
      id: 'INV-004',
      type: 'CORRECTNESS',
      name: 'Synchronous I/O in Route Handler',
      severity: 'HIGH',
      affectedFiles: ['src/routes/legacy.js'],
      evidence: [{ lineNumber: 8, excerpt: 'router.get(\'/legacy/export\', exportHandler)' }],
    },
  ],
  routeManifest: [
    { file: 'src/routes/users.js', method: 'POST', lineNumber: 12, excerpt: "router.post('/users', createUserHandler)" },
    { file: 'src/routes/users.js', method: 'GET',  lineNumber: 28, excerpt: "router.get('/users/:id', getUserHandler)" },
    { file: 'src/routes/auth.js',  method: 'POST', lineNumber: 9,  excerpt: "router.post('/auth/login', loginHandler)" },
    { file: 'src/routes/auth.js',  method: 'POST', lineNumber: 22, excerpt: "router.post('/auth/refresh', refreshHandler)" },
    { file: 'src/routes/legacy.js', method: 'GET', lineNumber: 8,  excerpt: "router.get('/legacy/export', exportHandler)" },
  ],
}

const MOCK_CEGIS = {
  synthesizedTests: 3,
  patchesGenerated: 2,
  patches: [
    {
      patchId: 'PATCH-INV-001',
      targetFile: 'src/routes/users.js',
      description: 'Insert token-validation middleware guard before the mutating handler.',
      diffHint:
        '+ if (!req.user || !req.headers.authorization) {\n' +
        '+   return res.status(401).json({ error: "Unauthorized" });\n' +
        '+ }',
    },
    {
      patchId: 'PATCH-INV-003',
      targetFile: 'src/db/transaction.js',
      description: 'Wrap transaction open in try/catch/finally with explicit COMMIT and ROLLBACK.',
      diffHint:
        '  await db.beginTransaction();\n' +
        '+ try {\n' +
        '    // operations\n' +
        '+   await db.commit();\n' +
        '+ } catch (err) {\n' +
        '+   await db.rollback();\n' +
        '+   throw err;\n' +
        '+ }',
    },
  ],
}

const MOCK_DRIFT = {
  docDriftCount: 7,
  driftRecords: [
    { file: 'src/routes/users.js', kind: 'UNDOCUMENTED_SYMBOL', symbol: 'createUserHandler', detail: "Exported symbol 'createUserHandler' has no documentation reference." },
    { file: 'src/routes/auth.js',  kind: 'UNDOCUMENTED_SYMBOL', symbol: 'refreshHandler',   detail: "Exported symbol 'refreshHandler' has no documentation reference." },
    { file: 'src/routes/legacy.js', kind: 'MISSING_ROUTE_DOC', symbol: '/legacy/export',    detail: "Route 'GET /legacy/export' is absent from all OpenAPI specs." },
    { file: 'docs',                kind: 'ORPHAN_DOC_REF',     symbol: 'OldAuthService',    detail: "Documentation references 'OldAuthService' but no corresponding export exists." },
    { file: 'docs',                kind: 'ORPHAN_DOC_REF',     symbol: 'TokenCache',        detail: "Documentation references 'TokenCache' but no corresponding export exists." },
    { file: 'src/db/pool.js',      kind: 'UNDOCUMENTED_SYMBOL', symbol: 'createPool',       detail: "Exported symbol 'createPool' has no documentation reference." },
    { file: 'src/models/User.js',  kind: 'UNDOCUMENTED_SYMBOL', symbol: 'UserSchema',       detail: "Exported symbol 'UserSchema' has no documentation reference." },
  ],
}

const ENERGY_SCORE = 0.2847

// ---------------------------------------------------------------------------
// Pipeline event log (simulated State Bus telemetry)
// ---------------------------------------------------------------------------

const PIPELINE_EVENTS = [
  { phase: 'ORCHESTRATOR', status: 'running',  payload: { rootDir: '/repo' },           timestamp: '2025-01-01T00:00:00.000Z' },
  { phase: 'ALPHA',        status: 'running',  payload: null,                            timestamp: '2025-01-01T00:00:00.120Z' },
  { phase: 'ALPHA',        status: 'done',     payload: MOCK_REPORT.summary,             timestamp: '2025-01-01T00:00:02.340Z' },
  { phase: 'BETA',         status: 'running',  payload: null,                            timestamp: '2025-01-01T00:00:02.350Z' },
  { phase: 'BETA',         status: 'done',     payload: { docDriftCount: 7 },            timestamp: '2025-01-01T00:00:03.120Z' },
  { phase: 'GAMMA',        status: 'running',  payload: null,                            timestamp: '2025-01-01T00:00:03.130Z' },
  { phase: 'GAMMA',        status: 'done',     payload: { synthesizedTests: 3, patchesGenerated: 2 }, timestamp: '2025-01-01T00:00:04.780Z' },
  { phase: 'ORCHESTRATOR', status: 'done',     payload: ENERGY_SCORE,                   timestamp: '2025-01-01T00:00:04.790Z' },
]

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function severityClass(severity) {
  if (severity === 'CRITICAL') return 'sev-critical'
  if (severity === 'HIGH')     return 'sev-high'
  if (severity === 'MEDIUM')   return 'sev-medium'
  return 'sev-low'
}

function driftKindLabel(kind) {
  const map = {
    UNDOCUMENTED_SYMBOL: 'Undocumented',
    ORPHAN_DOC_REF:      'Orphan ref',
    MISSING_ROUTE_DOC:   'Missing route doc',
    STALE_HEADING:       'Stale heading',
  }
  return map[kind] || kind
}

function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60)  return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricRow({ label, value, sub }) {
  return (
    <div className="metric-row">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}<span className="metric-sub">{sub}</span></span>
    </div>
  )
}

function SeverityBadge({ severity }) {
  return <span className={`badge ${severityClass(severity)}`}>{severity}</span>
}

function TypeBadge({ type }) {
  return <span className="badge type-badge">{type}</span>
}

function EnergyMeter({ score }) {
  // score: 0.0 (homeostatic) to 1.0+ (entropic)
  const pct = Math.min(score * 100, 100)
  const label = score < 0.15 ? 'HOMEOSTATIC' : score < 0.40 ? 'DRIFTING' : 'CRITICAL ENTROPY'
  return (
    <div className="energy-meter">
      <div className="energy-header">
        <span className="energy-title">System Energy E(S)</span>
        <span className="energy-score">{score.toFixed(4)}</span>
      </div>
      <div className="energy-track">
        <div className="energy-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="energy-footer">
        <span className="energy-label">{label}</span>
        <span className="energy-legend">0.0 = full homeostasis</span>
      </div>
    </div>
  )
}

function PhaseStatus({ phase, status }) {
  const dot = status === 'done' ? 'dot-done' : status === 'error' ? 'dot-error' : 'dot-running'
  return (
    <span className={`phase-dot ${dot}`} title={`${phase}: ${status}`} />
  )
}

function PipelineLog({ events = [] }) {
  const endRef = useRef(null)
  const [visible, setVisible] = useState([])

  useEffect(() => {
    setVisible([])
    let i = 0
    const id = setInterval(() => {
      if (i >= events.length) {
        clearInterval(id)
        return
      }
      const item = events[i]
      if (item) {
        setVisible(v => [...v, item])
      }
      i++
    }, 420)
    return () => clearInterval(id)
  }, [events])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [visible])

  return (
    <div className="pipeline-log">
      {visible.filter(Boolean).map((ev, i) => (
        <div key={i} className={`log-line ${ev?.status === 'error' ? 'log-error' : ''}`}>
          <span className="log-phase">[{ev?.phase || 'INFO'}]</span>
          <span className={`log-status status-${ev?.status || 'info'}`}>{(ev?.status || '').toUpperCase()}</span>
          {ev?.payload && typeof ev.payload === 'object' && !Array.isArray(ev.payload) && (
            <span className="log-payload">
              {Object.entries(ev.payload).map(([k, v]) => `${k}=${v}`).join(' ')}
            </span>
          )}
          {typeof ev?.payload === 'number' && (
            <span className="log-payload">energyScore={ev.payload}</span>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab views
// ---------------------------------------------------------------------------

function TabTopology({ report }) {
  return (
    <div className="tab-content">
      <section className="section">
        <h2 className="section-title">Repository Topology</h2>
        <div className="metrics-grid">
          <MetricRow label="Files scanned"    value={report.summary.totalFilesScanned} />
          <MetricRow label="Entry points"     value={report.summary.entryPointCount} />
          <MetricRow label="Route definitions" value={report.summary.routeCount} />
          <MetricRow label="Async boundaries" value={report.summary.asyncBoundaryCount} />
          <MetricRow label="State mutations"  value={report.summary.stateMutationCount} />
          <MetricRow label="Invariant violations" value={report.summary.invariantViolations} sub={` (${report.summary.criticalViolations} critical)`} />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Entry Points</h2>
        <ul className="path-list">
          {report.entryPoints.map(ep => (
            <li key={ep} className="path-item"><code>{ep}</code></li>
          ))}
        </ul>
      </section>

      <section className="section">
        <h2 className="section-title">Route Manifest</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Method</th>
              <th>File</th>
              <th>Line</th>
              <th>Excerpt</th>
            </tr>
          </thead>
          <tbody>
            {report.routeManifest.map((r, i) => (
              <tr key={i}>
                <td><span className={`method-badge method-${r.method.toLowerCase()}`}>{r.method}</span></td>
                <td><code className="file-ref">{r.file}</code></td>
                <td className="line-num">{r.lineNumber}</td>
                <td><code className="excerpt">{r.excerpt}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function TabInvariants({ invariants }) {
  const [expanded, setExpanded] = useState(null)

  return (
    <div className="tab-content">
      <section className="section">
        <h2 className="section-title">Discovered Invariants</h2>
        <p className="section-desc">
          Latent system rules extracted by the Morphologist. Each record identifies
          an implicit contract that the codebase currently violates.
        </p>
        <div className="invariant-list">
          {invariants.map(inv => (
            <div key={inv.id} className="invariant-card">
              <button
                className="invariant-header"
                onClick={() => setExpanded(e => e === inv.id ? null : inv.id)}
                aria-expanded={expanded === inv.id}
              >
                <span className="inv-id">{inv.id}</span>
                <span className="inv-name">{inv.name}</span>
                <span className="inv-badges">
                  <TypeBadge type={inv.type} />
                  <SeverityBadge severity={inv.severity} />
                </span>
                <span className="inv-toggle">{expanded === inv.id ? '▲' : '▼'}</span>
              </button>

              {expanded === inv.id && (
                <div className="invariant-body">
                  <div className="inv-files">
                    <span className="inv-label">Affected files:</span>
                    {inv.affectedFiles.map(f => <code key={f} className="file-ref">{f}</code>)}
                  </div>
                  <div className="inv-evidence">
                    <span className="inv-label">Evidence:</span>
                    <div className="evidence-list">
                      {inv.evidence.map((e, i) => (
                        <div key={i} className="evidence-row">
                          <span className="ev-line">L{e.lineNumber}</span>
                          <code className="ev-excerpt">{e.excerpt}</code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function TabDrift({ drift }) {
  const kindCounts = drift.driftRecords.reduce((acc, r) => {
    acc[r.kind] = (acc[r.kind] || 0) + 1
    return acc
  }, {})

  return (
    <div className="tab-content">
      <section className="section">
        <h2 className="section-title">Documentation Drift</h2>
        <p className="section-desc">
          Divergence between natural-language specifications and live AST reality,
          computed by Subagent Beta.
        </p>
        <div className="drift-summary">
          {Object.entries(kindCounts).map(([kind, count]) => (
            <div key={kind} className="drift-kind-row">
              <span className="drift-kind-label">{driftKindLabel(kind)}</span>
              <span className="drift-kind-count">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Drift Records</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Symbol</th>
              <th>File</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {drift.driftRecords.map((r, i) => (
              <tr key={i}>
                <td><span className="badge drift-badge">{driftKindLabel(r.kind)}</span></td>
                <td><code>{r.symbol}</code></td>
                <td><code className="file-ref">{r.file}</code></td>
                <td className="detail-cell">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function TabCegis({ cegis }) {
  return (
    <div className="tab-content">
      <section className="section">
        <h2 className="section-title">CEGIS Immune Response</h2>
        <p className="section-desc">
          Counterexample-Guided Inductive Synthesis output from Subagent Gamma.
          Each patch is an atomic repair targeted at a single invariant violation.
        </p>
        <div className="metrics-grid">
          <MetricRow label="Synthesized tests" value={cegis.synthesizedTests} />
          <MetricRow label="Patches generated" value={cegis.patchesGenerated} />
          <MetricRow label="Unresolved" value={cegis.synthesizedTests - cegis.patchesGenerated} />
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">Atomic Patch Descriptors</h2>
        <div className="patch-list">
          {cegis.patches.map(patch => (
            <div key={patch.patchId} className="patch-card">
              <div className="patch-header">
                <span className="patch-id">{patch.patchId}</span>
                <code className="file-ref">{patch.targetFile}</code>
              </div>
              <p className="patch-desc">{patch.description}</p>
              <pre className="diff-block">{patch.diffHint}</pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function TabPipeline({ events }) {
  const phases = ['ALPHA', 'BETA', 'GAMMA']
  const lastByPhase = phases.reduce((acc, p) => {
    const last = [...events].reverse().find(e => e.phase === p)
    acc[p] = last?.status || 'pending'
    return acc
  }, {})

  return (
    <div className="tab-content">
      <section className="section">
        <h2 className="section-title">Pipeline State</h2>
        <div className="phase-bar">
          {phases.map(p => (
            <div key={p} className="phase-item">
              <PhaseStatus phase={p} status={lastByPhase[p]} />
              <span className="phase-name">{p}</span>
              <span className={`phase-status-text status-${lastByPhase[p]}`}>{lastByPhase[p]}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="section-title">State Bus Telemetry</h2>
        <PipelineLog events={events} />
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'topology',  label: 'Topology' },
  { id: 'invariants', label: 'Invariants' },
  { id: 'drift',     label: 'Doc Drift' },
  { id: 'cegis',     label: 'CEGIS' },
  { id: 'pipeline',  label: 'Pipeline' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState('topology')

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <span className="wordmark">MSE</span>
          <span className="wordmark-sub">Morphogenetic Software Engine</span>
        </div>
        <div className="topbar-right">
          <EnergyMeter score={ENERGY_SCORE} />
        </div>
      </header>

      <nav className="tab-bar" role="tablist">
        {TABS.map(t => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`tab-btn ${activeTab === t.id ? 'tab-active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main-pane">
        {activeTab === 'topology'   && <TabTopology   report={MOCK_REPORT} />}
        {activeTab === 'invariants' && <TabInvariants invariants={MOCK_REPORT.discoveredInvariants} />}
        {activeTab === 'drift'      && <TabDrift      drift={MOCK_DRIFT} />}
        {activeTab === 'cegis'      && <TabCegis      cegis={MOCK_CEGIS} />}
        {activeTab === 'pipeline'   && <TabPipeline   events={PIPELINE_EVENTS} />}
      </main>

      <footer className="site-footer">
        <span>Project MSE &mdash; IBM Bob 2.0 Hackathon</span>
      </footer>
    </div>
  )
}
