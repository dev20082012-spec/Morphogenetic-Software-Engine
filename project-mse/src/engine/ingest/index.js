/**
 * Repository Ingestion — Public API
 *
 * Entry points for loading repositories into MSE's in-memory representation.
 */

export { loadDemoRepository } from './demoRepository.js';
export { loadEnterpriseFixture } from './enterpriseRepository.js';
export { loadZipRepository } from './zipLoader.js';
export { loadGitHubRepository, parseGitHubUrl } from './githubLoader.js';

/**
 * Validate a RepositorySnapshot for basic integrity.
 * @param {import('../types').RepositorySnapshot} snapshot
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== 'object') {
    errors.push('Snapshot is null or not an object');
    return { valid: false, errors };
  }
  if (!Array.isArray(snapshot.files)) {
    errors.push('Snapshot.files is not an array');
    return { valid: false, errors };
  }
  if (snapshot.files.length === 0) {
    errors.push('Snapshot contains no files');
  }
  for (let i = 0; i < snapshot.files.length; i++) {
    const f = snapshot.files[i];
    if (!f.path || typeof f.path !== 'string') {
      errors.push(`File at index ${i} has no valid path`);
    }
    if (typeof f.content !== 'string') {
      errors.push(`File "${f.path}" has no string content`);
    }
  }
  if (!snapshot.metadata || typeof snapshot.metadata !== 'object') {
    errors.push('Snapshot has no metadata');
  }

  return { valid: errors.length === 0, errors };
}
