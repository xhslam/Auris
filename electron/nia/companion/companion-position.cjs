"use strict";

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 360;
const EDGE_MARGIN = 18;

function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePlacement(value) {
  return Object.freeze({
    displayId: typeof value?.displayId === "string" ? value.displayId.slice(0, 160) : null,
    x: finite(value?.x, 0),
    y: finite(value?.y, 0),
  });
}

function clampPlacement(placement, workArea, box = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }) {
  const width = Math.max(1, finite(box.width, DEFAULT_WIDTH));
  const height = Math.max(1, finite(box.height, DEFAULT_HEIGHT));
  const minX = finite(workArea?.x, 0) + EDGE_MARGIN - width;
  const maxX = finite(workArea?.x, 0) + finite(workArea?.width, width) - EDGE_MARGIN;
  const minY = finite(workArea?.y, 0) + EDGE_MARGIN - height;
  const maxY = finite(workArea?.y, 0) + finite(workArea?.height, height) - EDGE_MARGIN;
  return Object.freeze({
    displayId: placement?.displayId ?? null,
    x: Math.round(Math.min(maxX, Math.max(minX, finite(placement?.x, maxX)))),
    y: Math.round(Math.min(maxY, Math.max(minY, finite(placement?.y, maxY)))),
  });
}

function defaultPlacement(workArea, box = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }) {
  return clampPlacement({ x: finite(workArea?.x, 0) + finite(workArea?.width, DEFAULT_WIDTH) - DEFAULT_WIDTH - EDGE_MARGIN, y: finite(workArea?.y, 0) + finite(workArea?.height, DEFAULT_HEIGHT) - DEFAULT_HEIGHT - EDGE_MARGIN }, workArea, box);
}

module.exports = { DEFAULT_HEIGHT, DEFAULT_WIDTH, clampPlacement, defaultPlacement, normalizePlacement };
