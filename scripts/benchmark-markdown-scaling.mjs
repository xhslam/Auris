#!/usr/bin/env node
/** Calibrated process CPU samples. This is a measured bound on these cases,
 * not a proof that arbitrary Markdown, callbacks or LaTeX cost is linear. */
import { fromMarkdown } from "mdast-util-from-markdown";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { findAndReplace } from "mdast-util-find-and-replace";
import { writeFileSync } from "node:fs";
const syntax = unified().use(remarkGfm).use(remarkMath).freeze().data();
const options = { extensions: syntax.micromarkExtensions, mdastExtensions: syntax.fromMarkdownExtensions };
const sizes = [2000, 4000, 8000];
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const cpuMs = (start) => { const time = process.cpuUsage(start); return (time.user + time.system) / 1000; };
let sink = 0;
function measure(run) {
  const start = process.cpuUsage();
  let iterations = 0;
  do { sink += run(); iterations++; } while (cpuMs(start) < 60);
  return cpuMs(start) / iterations;
}
const cases = [
  { name: "many-short-lists", build: (n) => { const input = "- item\n\nparagraph\n\n".repeat(n); return () => fromMarkdown(input, options).children.length; } },
  { name: "wide-list", build: (n) => { const input = "- item\n".repeat(n); return () => fromMarkdown(input, options).children[0].children.length; } },
  { name: "unmatched-inline-siblings", build: (n) => {
    const tree = { type: "root", children: [{ type: "paragraph", children: Array.from({ length: n }, (_, i) => ({ type: "text", value: `plain${i}` })) }] };
    return () => { findAndReplace(tree, [/never-match/g, "x"], { ignore: ["link"] }); return n; };
  } },
  { name: "quadratic-positive-control", build: (n) => { const children = Array.from({ length: n }, () => ({})); return () => { let sum = 0; for (const child of children) sum += children.indexOf(child); return sum; }; } },
];
const results = [];
for (const test of cases) {
  const runners = sizes.map(test.build);
  for (let warmup = 0; warmup < 6; warmup++) for (const run of runners) sink += run();
  const samples = sizes.map(() => []);
  // Alternate order so one size is not always sampled before JIT/GC settles.
  for (let round = 0; round < 7; round++) {
    const order = round % 2 ? [2, 1, 0] : [0, 1, 2];
    for (const index of order) samples[index].push(measure(runners[index]));
  }
  const medians = samples.map(median);
  const exponent = Math.log(medians[2] / medians[0]) / Math.log(sizes[2] / sizes[0]);
  results.push({ name: test.name, sizes, medianCpuMs: medians, samples, exponent });
  console.log(`${test.name}: exponent=${exponent.toFixed(3)}, CPU ms=${medians.map((value) => value.toFixed(3)).join(", ")}`);
}
const calibrated = results.at(-1).exponent >= 1.7;
const bounded = results.slice(0, -1).every((result) => result.exponent < 1.65);
const report = { node: process.version, platform: process.platform, clock: "process.cpuUsage (user + system); serial process", bound: 1.65, controlMinimum: 1.7, calibrated, bounded, results, sink };
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
if (process.argv.includes("--assert") && (!calibrated || !bounded)) {
  console.error(calibrated ? "Markdown growth bound exceeded." : "Timing control failed to distinguish quadratic growth; measurement is inconclusive.");
  process.exitCode = 1;
}
