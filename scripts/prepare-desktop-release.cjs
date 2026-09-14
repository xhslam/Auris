#!/usr/bin/env node
"use strict";

const path = require("node:path");
const {
  ReleaseTagPreparationError,
  createReleaseTagPreparer,
} = require("../electron/release-tag-preparer.cjs");

const projectRoot = path.resolve(__dirname, "..");
const preparer = createReleaseTagPreparer({
  appDirectory: projectRoot,
  log: (event, detail) => {
    process.stdout.write(`[desktop:release] ${event}${detail ? ` ${JSON.stringify(detail)}` : ""}\n`);
  },
});

preparer
  .prepare()
  .then((result) => {
    process.stdout.write(
      `[desktop:release] ${result.retriedTagPush ? "已重试推送" : "已创建并推送"} ${result.tag}。GitHub Actions 将构建并发布 ${result.version}。\n`,
    );
  })
  .catch((cause) => {
    const message = cause instanceof ReleaseTagPreparationError
      ? cause.message
      : "发布标签准备失败，请检查 Git 状态后重试。";
    process.stderr.write(`[desktop:release] ${message}\n`);
    process.exitCode = 1;
  });
