import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  createDefaultMcpPolicy,
  normalizeMcpPolicy,
  parseMcpDiscovery,
  serializeMcpDiscovery,
} = require("../../../electron/auris-mcp-config.cjs") as {
  createDefaultMcpPolicy: () => {
    autoApproveEdits: boolean;
    enabled: boolean;
    startOnLaunch: boolean;
  };
  normalizeMcpPolicy: (value: unknown) => {
    autoApproveEdits: boolean;
    enabled: boolean;
    startOnLaunch: boolean;
  };
  parseMcpDiscovery: (value: string) => {
    instanceId: string;
    pid: number;
    port: number;
    token: string;
    version: 1;
  };
  serializeMcpDiscovery: (value: {
    instanceId: string;
    pid: number;
    port: number;
    token: string;
  }) => string;
};

describe("Auris MCP configuration", () => {
  it("defaults to a disabled service and explicit edit approval", () => {
    expect(createDefaultMcpPolicy()).toEqual({
      autoApproveEdits: false,
      enabled: false,
      startOnLaunch: true,
    });
  });

  it("normalizes malformed persisted policy without escalating access", () => {
    expect(normalizeMcpPolicy({ autoApproveEdits: true, enabled: "yes" })).toEqual({
      autoApproveEdits: false,
      enabled: false,
      startOnLaunch: true,
    });
  });

  it("round-trips a versioned discovery record", () => {
    const serialized = serializeMcpDiscovery({
      instanceId: "instance-1",
      pid: 123,
      port: 4567,
      token: "token-1",
    });

    expect(JSON.parse(serialized)).toEqual({
      instance_id: "instance-1",
      pid: 123,
      port: 4567,
      token: "token-1",
      version: 1,
    });
    expect(parseMcpDiscovery(serialized)).toEqual({
      instanceId: "instance-1",
      pid: 123,
      port: 4567,
      token: "token-1",
      version: 1,
    });
  });

  it("rejects malformed discovery without exposing a partial token", () => {
    expect(() => parseMcpDiscovery('{"port":4567,"token":"token-1"}')).toThrow(
      /invalid Auris MCP discovery/i,
    );
  });
});
