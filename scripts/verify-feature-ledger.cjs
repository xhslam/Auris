"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FEATURE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_PROJECT_PATH = /^(?!\/)(?!.*\\)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\/\/).+$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateFeatureLedger(ledger, projectRoot) {
  const errors = [];
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    return ["ledger must be an object"];
  }
  if (ledger.schemaVersion !== 1) errors.push("schemaVersion must equal 1");
  if (!Array.isArray(ledger.domains) || ledger.domains.length === 0) {
    errors.push("domains must be a non-empty array");
    return errors;
  }
  const featureIds = new Set();
  for (const domain of ledger.domains) {
    if (!domain || typeof domain !== "object") {
      errors.push("each domain must be an object");
      continue;
    }
    if (!FEATURE_ID.test(domain.domainId || "")) {
      errors.push(`invalid domainId: ${String(domain.domainId)}`);
    }
    if (typeof domain.problem !== "string" || !domain.problem.trim()) {
      errors.push(`domain ${domain.domainId || "<unknown>"} is missing problem`);
    }
    if (!Array.isArray(domain.features) || domain.features.length === 0) {
      errors.push(`domain ${domain.domainId || "<unknown>"} has no features`);
      continue;
    }
    for (const feature of domain.features) {
      const label = feature?.featureId || "<unknown>";
      if (!feature || typeof feature !== "object") {
        errors.push(`domain ${domain.domainId}: feature must be an object`);
        continue;
      }
      if (!FEATURE_ID.test(label)) errors.push(`invalid featureId: ${label}`);
      if (featureIds.has(label)) errors.push(`duplicate featureId: ${label}`);
      featureIds.add(label);
      if (typeof feature.problem !== "string" || !feature.problem.trim()) {
        errors.push(`feature ${label} is missing problem`);
      }
      for (const field of ["implementation", "tests"]) {
        if (!Array.isArray(feature[field]) || feature[field].length === 0) {
          errors.push(`feature ${label} requires ${field}`);
          continue;
        }
        for (const relativePath of feature[field]) {
          if (typeof relativePath !== "string" || !SAFE_PROJECT_PATH.test(relativePath)) {
            errors.push(`feature ${label} has unsafe ${field} path: ${String(relativePath)}`);
            continue;
          }
          if (!fs.existsSync(path.join(projectRoot, relativePath))) {
            errors.push(`feature ${label} ${field} path does not exist: ${relativePath}`);
          }
        }
      }
    }
  }
  return errors;
}

function verifyFeatureLedger(projectRoot = process.cwd()) {
  const ledgerPath = path.join(projectRoot, "docs", "quality", "feature-ledger.json");
  const errors = validateFeatureLedger(readJson(ledgerPath), projectRoot);
  if (errors.length) {
    throw new Error(`Feature ledger validation failed:\n- ${errors.join("\n- ")}`);
  }
  return readJson(ledgerPath);
}

if (require.main === module) {
  try {
    const ledger = verifyFeatureLedger();
    const features = ledger.domains.reduce((count, domain) => count + domain.features.length, 0);
    process.stdout.write(`Feature ledger OK: ${ledger.domains.length} domains, ${features} features.\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { SAFE_PROJECT_PATH, validateFeatureLedger, verifyFeatureLedger };
