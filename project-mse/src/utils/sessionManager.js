/**
 * Analysis Sessions & Local Product Memory Manager
 *
 * Persists recent analysis runs and repositories in browser localStorage
 * with graceful memory fallback. Enforces quota limits (max 20 runs).
 */

const STORAGE_KEY = 'mse_analysis_runs_v2';
const RECENT_REPOS_KEY = 'mse_recent_repos_v2';
const MAX_RUNS = 20;

let memoryRuns = [];
let memoryRecentRepos = [];

function isLocalStorageAvailable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    const testKey = '__mse_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get all historical analysis runs.
 *
 * @returns {Array<object>}
 */
export function getAnalysisRuns() {
  if (!isLocalStorageAvailable()) {
    return memoryRuns;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return memoryRuns;
  }
}

export function getNextAnalysisRunId() {
  const highestRunNumber = getAnalysisRuns().reduce((highest, run) => {
    const match = /^RUN #(\d+)$/.exec(run?.id || '');
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `RUN #${String(highestRunNumber + 1).padStart(3, '0')}`;
}

/**
 * Save an analysis run to history.
 *
 * @param {object} run
 * @returns {object} The saved run
 */
export function saveAnalysisRun(run) {
  const existing = getAnalysisRuns();
  const formattedId = getNextAnalysisRunId();

  const runRecord = {
    id: formattedId,
    repositoryName: run.repositoryName || 'repository',
    repositorySource: run.repositorySource || 'demo',
    timestamp: new Date().toISOString(),
    startTime: run.startTime || run.timestamp || new Date().toISOString(),
    durationMs: run.durationMs || 0,
    filesCount: run.filesCount || 0,
    findingsCount: run.findingsCount || 0,
    invariantViolations: run.invariantViolations || 0,
    counterexamplesCount: run.counterexamplesCount || 0,
    patchesCount: run.patchesCount || 0,
    candidateRepairs: run.candidateRepairs || run.patchesCount || 0,
    verificationOutcome: run.verificationOutcome || 'VERIFIED',
    decision: run.decision || null,
    snapshot: run.snapshot,
    pipelineResult: run.pipelineResult
  };

  const updated = [runRecord, ...existing.filter(r => r.id !== runRecord.id)].slice(0, MAX_RUNS);

  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // If quota exceeded, store in memory
      memoryRuns = updated;
    }
  } else {
    memoryRuns = updated;
  }

  // Also record in recent repositories
  saveRecentRepository({
    name: runRecord.repositoryName,
    source: runRecord.repositorySource,
    lastAnalyzed: runRecord.timestamp
  });

  return runRecord;
}

/**
 * Get list of recent repositories.
 */
export function getRecentRepositories() {
  if (!isLocalStorageAvailable()) {
    return memoryRecentRepos;
  }

  try {
    const raw = window.localStorage.getItem(RECENT_REPOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return memoryRecentRepos;
  }
}

/**
 * Save a recent repository record.
 */
export function saveRecentRepository(repo) {
  const existing = getRecentRepositories();
  const updated = [
    repo,
    ...existing.filter(r => r.name !== repo.name)
  ].slice(0, 10);

  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated));
    } catch {
      memoryRecentRepos = updated;
    }
  } else {
    memoryRecentRepos = updated;
  }
}

/**
 * Clear analysis history.
 */
export function clearAnalysisRuns() {
  memoryRuns = [];
  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }
}
