/**
 * Beta — Document/Code Drift Reconciliation
 *
 * Inspects documentation files (README, OpenAPI, .env.example, configs)
 * and detects concrete mismatches against the code analysis results.
 *
 * Every finding contains real evidence with file path and line number.
 */

import { basename } from '../pathUtils.js';

/**
 * Analyze drift between documentation and code.
 *
 * @param {import('../types').RepositorySnapshot} snapshot
 * @param {import('../repositoryGraph/index.js').AnalysisResult} analysis
 * @returns {DriftResult}
 */
export function analyzeDrift(snapshot, analysis) {
  const startTime = performance.now();
  const findings = [];
  let findingCounter = 0;

  const nextId = () => {
    findingCounter++;
    return `BETA-${String(findingCounter).padStart(3, '0')}`;
  };

  // Gather documentation files
  const readmeFiles = snapshot.files.filter(f =>
    /readme/i.test(basename(f.path)) && f.language === 'markdown'
  );
  const openapiFiles = snapshot.files.filter(f =>
    /openapi|swagger/i.test(f.path) && (f.language === 'yaml' || f.language === 'json')
  );
  const envExampleFiles = snapshot.files.filter(f =>
    /\.env\.example|\.env\.sample|\.env\.template/i.test(f.path)
  );

  // ---- Rule 1: Port mismatch (README vs code) ----
  for (const readme of readmeFiles) {
    const docPorts = extractPortsFromDoc(readme.content, readme.path);
    const codePorts = extractPortsFromCode(analysis);

    for (const docPort of docPorts) {
      for (const codePort of codePorts) {
        if (docPort.port !== codePort.port) {
          findings.push({
            id: nextId(),
            type: 'drift',
            severity: 'HIGH',
            title: `Port mismatch: documentation says ${docPort.port}, code uses ${codePort.port}`,
            description: `${readme.path} claims the service runs on port ${docPort.port}, but the source code binds to port ${codePort.port}. This will confuse developers and break deployment scripts.`,
            sourceEvidence: [{
              file: codePort.file,
              line: codePort.line,
              excerpt: codePort.excerpt,
              context: `Code binds to port ${codePort.port}`,
            }],
            documentationEvidence: [{
              file: readme.path,
              line: docPort.line,
              excerpt: docPort.excerpt,
              context: `Documentation claims port ${docPort.port}`,
            }],
            confidence: 'high',
          });
        }
      }
    }
  }

  // ---- Rule 2: .env.example port mismatch ----
  for (const envFile of envExampleFiles) {
    const envPorts = extractPortsFromEnv(envFile.content, envFile.path);
    const codePorts = extractPortsFromCode(analysis);

    for (const envPort of envPorts) {
      for (const codePort of codePorts) {
        if (envPort.port !== codePort.port) {
          findings.push({
            id: nextId(),
            type: 'configuration',
            severity: 'HIGH',
            title: `Port mismatch: .env.example says ${envPort.port}, code defaults to ${codePort.port}`,
            description: `${envFile.path} sets PORT=${envPort.port}, but the code defaults to port ${codePort.port}. Developers using the example env will connect to the wrong port.`,
            sourceEvidence: [{
              file: codePort.file,
              line: codePort.line,
              excerpt: codePort.excerpt,
              context: `Code defaults to port ${codePort.port}`,
            }],
            documentationEvidence: [{
              file: envFile.path,
              line: envPort.line,
              excerpt: envPort.excerpt,
              context: `Env example sets PORT=${envPort.port}`,
            }],
            confidence: 'high',
          });
        }
      }
    }
  }

  // ---- Rule 3: Documented auth mode vs source auth mode ----
  for (const readme of readmeFiles) {
    const docAuthClaims = extractAuthClaimsFromDoc(readme.content, readme.path);

    for (const claim of docAuthClaims) {
      // Check if code implements RS256/RSA authentication while doc claims HMAC
      if (claim.type === 'hmac-auth' || claim.type === 'hmac-webhook') {
        const rsaFile = snapshot.files.find(f => f.content && /RS256|RSA-SHA256/i.test(f.content));
        if (rsaFile) {
          const lines = rsaFile.content.split('\n');
          let rsaLine = 1;
          let rsaExcerpt = '';
          for (let l = 0; l < lines.length; l++) {
            if (/RS256|RSA-SHA256/i.test(lines[l])) {
              rsaLine = l + 1;
              rsaExcerpt = lines[l].trim();
              break;
            }
          }

          findings.push({
            id: nextId(),
            type: 'drift',
            severity: 'HIGH',
            title: `Authentication scheme drift: Documentation specifies HMAC, code implements RS256/RSA`,
            description: `${readme.path} specifies ${claim.scheme} as the required authentication scheme, but ${rsaFile.path} implements RS256/RSA public-key authentication.`,
            sourceEvidence: [{
              file: rsaFile.path,
              line: rsaLine,
              excerpt: rsaExcerpt,
              context: 'Source code implements RS256/RSA authentication',
            }],
            documentationEvidence: [{
              file: readme.path,
              line: claim.line,
              excerpt: claim.excerpt,
              context: `Documentation specifies ${claim.scheme}`,
            }],
            confidence: 'high',
          });
        }
      }

      // Check if the claimed auth is actually enforced in code
      if (claim.type === 'hmac-webhook' || claim.type === 'hmac-auth') {
        // Find webhook routes that don't verify signatures
        const webhookRoutes = analysis.routes.filter(r =>
          r.method !== 'USE' && /webhook|hook|github|stripe/i.test(r.path)
        );
        for (const route of webhookRoutes) {
          if (!route.hasAuth) {
            const routeFile = analysis.files.find(f => f.path === route.file);
            // Check if the route file imports any HMAC verification
            const hasHmacImport = routeFile?.imports.some(imp =>
              /verify.*signature|hmac|crypto/i.test(imp.specifier)
            );
            if (!hasHmacImport) {
              findings.push({
                id: nextId(),
                type: 'security',
                severity: 'CRITICAL',
                title: `Documentation requires HMAC auth for webhooks, but code does not verify signatures`,
                description: `${readme.path} states that ${claim.scheme} is required for webhook endpoints, but ${route.file} processes webhook payloads without any signature verification.`,
                sourceEvidence: [{
                  file: route.file,
                  line: route.line,
                  excerpt: route.excerpt,
                  context: 'Webhook route processes payload without HMAC verification',
                }],
                documentationEvidence: [{
                  file: readme.path,
                  line: claim.line,
                  excerpt: claim.excerpt,
                  context: `Documentation requires ${claim.scheme}`,
                }],
                confidence: 'high',
              });
            }
          }
        }
      }
    }
  }

  // ---- Rule 4: OpenAPI required parameters not checked in code ----
  for (const apiFile of openapiFiles) {
    const requiredParams = extractOpenAPIRequiredParams(apiFile.content, apiFile.path);

    for (const param of requiredParams) {
      // Find matching route in code analysis
      const matchingRoutes = analysis.routes.filter(r =>
        r.path === param.path || param.path.endsWith(r.path) || r.path.endsWith(param.path.split('/').pop())
      );

      for (const route of matchingRoutes) {
        const routeFile = analysis.files.find(f => f.path === route.file);
        if (!routeFile) continue;

        // Check if the required header/param is referenced in the route's file
        const fileContent = routeFile.path;
        const sourceFile = snapshot.files.find(f => f.path === fileContent);
        if (!sourceFile) continue;

        const paramReferenced = sourceFile.content.includes(param.name) ||
          sourceFile.content.toLowerCase().includes(param.name.toLowerCase());

        if (!paramReferenced && param.location === 'header') {
          findings.push({
            id: nextId(),
            type: 'security',
            severity: 'CRITICAL',
            title: `OpenAPI requires header "${param.name}" but code does not check it`,
            description: `The OpenAPI spec at ${apiFile.path} declares ${param.name} as a required header for ${param.method.toUpperCase()} ${param.path}, but the handler in ${route.file} does not read or validate this header.`,
            sourceEvidence: [{
              file: route.file,
              line: route.line,
              excerpt: route.excerpt,
              context: `Route handler does not reference "${param.name}"`,
            }],
            documentationEvidence: [{
              file: apiFile.path,
              line: param.line,
              excerpt: param.excerpt,
              context: `OpenAPI declares ${param.name} as required`,
            }],
            confidence: 'high',
          });
        }
      }
    }
  }

  // ---- Rule 5: Documented endpoint vs discovered endpoints ----
  for (const readme of readmeFiles) {
    const docEndpoints = extractEndpointsFromDoc(readme.content, readme.path);

    for (const docEp of docEndpoints) {
      // Check if docs claim endpoint requires authentication
      if (docEp.requiresAuth) {
        const matchingCodeEp = analysis.routes.find(r =>
          r.path === docEp.path && r.method === docEp.method
        );
        if (matchingCodeEp && !matchingCodeEp.hasAuth) {
          findings.push({
            id: nextId(),
            type: 'security',
            severity: 'HIGH',
            title: `Documentation claims ${docEp.method} ${docEp.path} requires authentication, but code has no auth middleware`,
            description: `${readme.path} states that ${docEp.method} ${docEp.path} requires authentication, but the route handler in ${matchingCodeEp.file} does not include any auth middleware.`,
            sourceEvidence: [{
              file: matchingCodeEp.file,
              line: matchingCodeEp.line,
              excerpt: matchingCodeEp.excerpt,
              context: 'Route registered without auth middleware',
            }],
            documentationEvidence: [{
              file: readme.path,
              line: docEp.line,
              excerpt: docEp.excerpt,
              context: 'Documentation claims authentication is required',
            }],
            confidence: 'medium',
          });
        }
      }
    }
  }

  // ---- Rule 6: Documented env vars vs used env vars ----
  for (const envFile of envExampleFiles) {
    const documentedVars = extractEnvVarNames(envFile.content, envFile.path);
    const usedVars = analysis.environmentVariables;

    for (const usedVar of usedVars) {
      const isDocumented = documentedVars.some(dv => dv.name === usedVar.name);
      if (!isDocumented) {
        findings.push({
          id: nextId(),
          type: 'configuration',
          severity: 'MEDIUM',
          title: `Environment variable "${usedVar.name}" used in code but not in .env.example`,
          description: `The code references process.env.${usedVar.name} but ${envFile.path} does not include this variable. Developers may miss required configuration.`,
          sourceEvidence: usedVar.usages.map(u => ({
            file: u.file,
            line: u.line,
            excerpt: `process.env.${usedVar.name}`,
            context: 'Variable used in source code',
          })),
          documentationEvidence: [{
            file: envFile.path,
            line: 1,
            excerpt: envFile.content.split('\n').slice(0, 3).join('; '),
            context: `Variable "${usedVar.name}" not present in env example`,
          }],
          confidence: 'medium',
        });
      }
    }
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    findings,
    stats: {
      readmeFilesScanned: readmeFiles.length,
      openapiFilesScanned: openapiFiles.length,
      envFilesScanned: envExampleFiles.length,
      driftFindingsCount: findings.length,
      criticalCount: findings.filter(f => f.severity === 'CRITICAL').length,
      durationMs,
    },
  };
}

// ----- Extraction Helpers -----

function extractPortsFromDoc(content, filePath) {
  const ports = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    // Skip database or third-party service ports
    if (/postgres|mysql|redis|mongo|database/i.test(lines[i])) continue;

    // Match patterns like "Port: 3000", "port 3000", "localhost:3000", "PORT=3000"
    const portMatch = lines[i].match(/(?:port[:\s=]+|localhost:)(\d{2,5})/i);
    if (portMatch) {
      ports.push({
        port: portMatch[1],
        line: i + 1,
        excerpt: lines[i].trim(),
        file: filePath,
      });
    }
  }
  return ports;
}

function extractPortsFromCode(analysis) {
  const ports = [];
  for (const envVar of analysis.environmentVariables) {
    if (envVar.name === 'PORT' && envVar.defaultValue) {
      for (const usage of envVar.usages) {
        ports.push({
          port: envVar.defaultValue,
          file: usage.file,
          line: usage.line,
          excerpt: `process.env.PORT || ${envVar.defaultValue}`,
        });
      }
    }
  }
  return ports;
}

function extractPortsFromEnv(content, filePath) {
  const ports = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^PORT\s*=\s*(\d+)/);
    if (match) {
      ports.push({
        port: match[1],
        line: i + 1,
        excerpt: lines[i].trim(),
        file: filePath,
      });
    }
  }
  return ports;
}

function extractAuthClaimsFromDoc(content, filePath) {
  const claims = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/HMAC[-\s]?(?:SHA256|auth|authentication)/i.test(line)) {
      claims.push({
        type: 'hmac-auth',
        scheme: 'HMAC authentication',
        line: i + 1,
        excerpt: line.trim(),
        file: filePath,
      });
    }
    if (/JWT|Bearer\s+token/i.test(line) && /required|must/i.test(line)) {
      claims.push({
        type: 'jwt',
        scheme: 'JWT Bearer Token',
        line: i + 1,
        excerpt: line.trim(),
        file: filePath,
      });
    }
  }
  return claims;
}

function extractOpenAPIRequiredParams(content, _filePath) {
  const params = [];
  const lines = content.split('\n');
  let currentPath = '';
  let currentMethod = '';
  let inParameters = false;
  let currentParamName = '';
  let currentParamIn = '';
  let isRequired = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Detect path
    const pathMatch = line.match(/^\s{2}(\/\S+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }

    // Detect method
    const methodMatch = line.match(/^\s{4}(get|post|put|patch|delete):\s*$/);
    if (methodMatch) {
      currentMethod = methodMatch[1];
      continue;
    }

    // Detect parameters section
    if (trimmed === 'parameters:') {
      inParameters = true;
      continue;
    }

    if (inParameters) {
      const nameMatch = trimmed.match(/^-?\s*name:\s*(.+)/);
      if (nameMatch) {
        // Save previous param if required
        if (currentParamName && isRequired) {
          params.push({
            name: currentParamName,
            location: currentParamIn,
            path: currentPath,
            method: currentMethod,
            line: i, // approximate
            excerpt: `${currentParamName} (${currentParamIn}, required)`,
          });
        }
        currentParamName = nameMatch[1].trim();
        currentParamIn = '';
        isRequired = false;
      }

      const inMatch = trimmed.match(/^in:\s*(.+)/);
      if (inMatch) currentParamIn = inMatch[1].trim();

      const reqMatch = trimmed.match(/^required:\s*(.+)/);
      if (reqMatch) isRequired = reqMatch[1].trim() === 'true';

      // Detect end of parameters section
      if (/^\s{4}\w/.test(line) && !line.includes('parameters') && !/^\s{6,}/.test(line) && !trimmed.startsWith('-')) {
        // Save last param
        if (currentParamName && isRequired) {
          params.push({
            name: currentParamName,
            location: currentParamIn,
            path: currentPath,
            method: currentMethod,
            line: i,
            excerpt: `${currentParamName} (${currentParamIn}, required)`,
          });
        }
        inParameters = false;
        currentParamName = '';
      }
    }
  }

  // Flush any remaining param
  if (currentParamName && isRequired) {
    params.push({
      name: currentParamName,
      location: currentParamIn,
      path: currentPath,
      method: currentMethod,
      line: lines.length,
      excerpt: `${currentParamName} (${currentParamIn}, required)`,
    });
  }

  return params;
}

function extractEndpointsFromDoc(content, filePath) {
  const endpoints = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match patterns like "- POST /users — description (requires authentication)"
    const epMatch = line.match(/[-*]\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);
    if (epMatch) {
      const requiresAuth = /requires?\s+auth|authenticated/i.test(line);
      endpoints.push({
        method: epMatch[1].toUpperCase(),
        path: epMatch[2].replace(/\s.*$/, ''),
        line: i + 1,
        excerpt: line.trim(),
        file: filePath,
        requiresAuth,
      });
    }
  }
  return endpoints;
}

function extractEnvVarNames(content, filePath) {
  const vars = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([A-Z_][A-Z0-9_]*)\s*=/);
    if (match) {
      vars.push({ name: match[1], line: i + 1, file: filePath });
    }
  }
  return vars;
}

/**
 * @typedef {{
 *   findings: import('../types').Finding[],
 *   stats: {
 *     readmeFilesScanned: number,
 *     openapiFilesScanned: number,
 *     envFilesScanned: number,
 *     driftFindingsCount: number,
 *     criticalCount: number,
 *     durationMs: number,
 *   },
 * }} DriftResult
 */
