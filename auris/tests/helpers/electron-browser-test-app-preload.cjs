"use strict";
/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

const NOTES_MCP_REQUEST_CHANNEL = "shadowing:notes-mcp:request";

ipcRenderer.on(NOTES_MCP_REQUEST_CHANNEL, (_event, payload) => {
  const bridgeRequestId = payload?.bridgeRequestId;
  const request = payload?.request;
  if (typeof bridgeRequestId !== "string" || !bridgeRequestId) return;
  void ipcRenderer
    .invoke("auris-test-app:notes-mcp:handle", request)
    .then((result) => ipcRenderer.invoke(
      "shadowing:notes-mcp:resolve-request",
      bridgeRequestId,
      result,
    ))
    .catch((error) => ipcRenderer.invoke(
      "shadowing:notes-mcp:reject-request",
      bridgeRequestId,
      error instanceof Error ? error.message : String(error),
    ));
});

contextBridge.exposeInMainWorld("aurisTestAppNotesHost", {
  ready: true,
});
