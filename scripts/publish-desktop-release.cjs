#!/usr/bin/env node
"use strict";

const path = require("node:path");
const {
  DesktopReleaseError,
  createDesktopReleasePublisher,
} = require("../electron/development-release-publisher.cjs");

const projectRoot = path.resolve(__dirname, "..");
const checkOnly = process.argv.slice(2).includes("--check");

const publisher = createDesktopReleasePublisher({
  appDirectory: projectRoot,
  log: (event, detail) => {
    process.stdout.write(`[desktop:release] ${event}${detail ? ` ${JSON.stringify(detail)}` : ""}\n`);
  },
});

publisher
  .publish({ checkOnly })
  .then((result) => {
    if (checkOnly) {
      process.stdout.write(
        `[desktop:release] 预检通过：${result.target.label} v${result.version}（${result.branch}）。\n`,
      );
      return;
    }
    process.stdout.write(
      `[desktop:release] 已发布 ${result.target.label} ${result.releaseTag}，更新元数据：${result.metadataPath}\n`,
    );
  })
  .catch((cause) => {
    const message = cause instanceof DesktopReleaseError
      ? cause.message
      : "桌面发布失败，请检查构建环境后重试。";
    process.stderr.write(`[desktop:release] ${message}\n`);
    process.exitCode = 1;
  });
