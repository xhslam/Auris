"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

function writeTimingReport(file, report) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // A colliding name must never overwrite another attempt's evidence.
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
}

function createUpdateTiming({
  checkOnly = false,
  reportDir,
  clock = () => performance.now(),
  now = () => new Date().toISOString(),
  id = () => `${new Date().toISOString().replace(/[:.]/gu, "-")}-${crypto.randomUUID()}`,
  writeReport = writeTimingReport,
  logger = console,
} = {}) {
  const started = clock();
  const report = { schemaVersion: 1, mode: checkOnly ? "check" : "update", startedAt: now(), status: "running", context: {}, stages: [] };
  let finished = false;
  let reportFile = null;
  function duration(start) { return Math.max(0, Math.round((clock() - start) * 1000) / 1000); }
  function emit(method, message) {
    // Timing is observational. Broken stdout or a custom logger must not
    // replace the operation's exception or change an installation result.
    try { logger[method](message); } catch { /* The caller still owns its result. */ }
  }
  function begin(name) {
    const stage = { name, startedAt: now(), status: "running" };
    report.stages.push(stage);
    emit("log", `[update:timing] ${name}: start`);
    return { stage, tick: clock() };
  }
  function end(entry, status, error) {
    const { stage, tick } = entry;
    stage.finishedAt = now();
    stage.durationMs = duration(tick);
    stage.status = status;
    // Do not persist raw errors: existing command errors may contain subprocess
    // output. The unchanged original exception is handled by the caller.
    if (status === "failed") stage.errorType = error instanceof Error ? error.name : typeof error;
    emit("log", `[update:timing] ${stage.name}: ${stage.status} (${(stage.durationMs / 1000).toFixed(2)}s)`);
  }
  return {
    context(values) {
      for (const key of ["sha", "version", "ciRunId", "ciTestedSha", "docsOnly", "outcome"]) {
        if (Object.hasOwn(values, key)) report.context[key] = values[key];
      }
    },
    sync(name, action) {
      const entry = begin(name);
      try { const result = action(); end(entry, "success"); return result; }
      catch (error) { end(entry, "failed", error); throw error; }
    },
    async async(name, action) {
      const entry = begin(name);
      try { const result = await action(); end(entry, "success"); return result; }
      catch (error) { end(entry, "failed", error); throw error; }
    },
    finish(status) {
      if (finished) return reportFile;
      finished = true;
      report.status = status;
      report.finishedAt = now();
      report.totalDurationMs = duration(started);
      const failed = report.stages.findLast(stage => stage.status === "failed");
      if (failed) report.failedStage = failed.name;
      emit("log", `[update:timing] total: ${status} (${(report.totalDurationMs / 1000).toFixed(2)}s)`);
      if (checkOnly) return null;
      try {
        if (!reportDir) throw new Error("Missing timing report directory");
        const name = id();
        if (!/^[a-z0-9_-]+$/iu.test(name)) throw new Error("Invalid timing report name");
        const file = path.join(reportDir, `${name}.json`);
        writeReport(file, report);
        reportFile = file;
        emit("log", `[update:timing] report: ${file}`);
      } catch {
        // Observability failure must not replace an installation error or turn
        // an already verified successful installation into a false failure.
        emit("warn", "[update:timing] report write failed; use the console stage timings");
      }
      return reportFile;
    },
  };
}

async function withUpdateTiming(timing, action) {
  let status = "failed";
  try {
    const result = await action();
    status = "success";
    return result;
  } finally {
    timing.finish(status);
  }
}

module.exports = { createUpdateTiming, withUpdateTiming };
