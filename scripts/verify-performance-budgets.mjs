#!/usr/bin/env node
import fs from 'node:fs';

const file = process.argv[2] ?? 'release1/performance-results.json';
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const requiredTargets = ['android', 'ios', 'macos', 'web'];
const failures = [];
const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];

for (const target of requiredTargets) {
  const result = report.targets?.find(item => item.target === target);
  if (!result) { failures.push(`${target}: result missing`); continue; }
  if (!Array.isArray(result.runs) || result.runs.length < 10) {
    failures.push(`${target}: requires at least ten controlled runs`);
    continue;
  }
  const limit = (field, maximum) => {
    const value = p95(result.runs.map(run => run[field]));
    if (!Number.isFinite(value) || value > maximum) failures.push(`${target}: ${field} p95 ${value} > ${maximum}`);
  };
  limit('coldStartMs', target === 'macos' ? 1500 : 2000);
  limit('bundleReadyReloadMs', 750);
  limit('localServerReloadMs', 2000);
  limit('jankyFramePercent', 3);
  limit('idleCpuPercent', 5);
  limit('rssMiB', target === 'android' || target === 'ios' ? 200 : 300);
  limit('resumedFrameMs', 1000);
  limit('networkReconnectMs', 10000);
  for (const run of result.runs) {
    if (run.p95FrameTimeMs > run.refreshBudgetMs * 1.25) failures.push(`${target}: frame-time budget exceeded`);
    if (run.memoryGrowthMiB > Math.max(20, run.baselineMemoryMiB * 0.1)) failures.push(`${target}: reload/project-switch memory growth exceeded`);
    if (run.suspendResumeCycles < 50 || run.resizeRotationCycles < 100) failures.push(`${target}: lifecycle cycle coverage incomplete`);
    if (run.runningRevisionPreserved !== true) failures.push(`${target}: network loss did not preserve running revision`);
  }
}

if (failures.length) {
  console.error(`Performance gate failed:\n${failures.map(item => `  - ${item}`).join('\n')}`);
  process.exit(1);
}
console.log('Performance budgets passed for ten runs on every Tier-1 target.');
