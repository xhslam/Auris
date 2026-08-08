import http from "node:http";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { findOpenPort, findResponsiveServerUrl } = require("../../../electron/utils/find-open-port.cjs") as {
  findOpenPort: (preferredPort?: number, attempts?: number) => Promise<number>;
  findResponsiveServerUrl: (
    ports: number[],
    options?: {
      path?: string;
      timeoutMs?: number;
      validateResponse?: (response: {
        body: string;
        headers: http.IncomingHttpHeaders;
        statusCode: number;
      }) => boolean;
    },
  ) => Promise<string | null>;
};

function listen(host: string, port = 0) {
  const server = net.createServer();

  return new Promise<{ port: number; server: net.Server }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Expected TCP server address."));
        return;
      }

      resolve({ port: address.port, server });
    });
  });
}

function close(server: net.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function listenHttp(handler: http.RequestListener) {
  const server = http.createServer(handler);

  return new Promise<{ port: number; server: http.Server }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Expected HTTP server address."));
        return;
      }

      resolve({ port: address.port, server });
    });
  });
}

describe("find-open-port", () => {
  it("skips ports already reserved on the renderer's IPv4 loopback", async () => {
    const { port, server } = await listen("127.0.0.1");

    try {
      await expect(findOpenPort(port, 1)).rejects.toThrow(
        "Unable to find an open localhost port",
      );
    } finally {
      await close(server);
    }
  });

  it("can reuse the numeric port when only IPv6 is reserved", async () => {
    const { port, server } = await listen("::");

    try {
      await expect(findOpenPort(port, 1)).resolves.toBe(port);
    } finally {
      await close(server);
    }
  });

  it("reuses an existing Auris-compatible dev server when one is already running", async () => {
    const { port, server } = await listenHttp((req, res) => {
      if (req.url !== "/api/templates") {
        res.writeHead(404);
        res.end("not found");
        return;
      }

      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ templates: [] }));
    });

    try {
      await expect(
        findResponsiveServerUrl([port], {
          path: "/api/templates",
          validateResponse: (response) => {
            if (response.statusCode !== 200) {
              return false;
            }

            const payload = JSON.parse(response.body) as { templates?: unknown };
            return Array.isArray(payload.templates);
          },
        }),
      ).resolves.toBe(`http://127.0.0.1:${port}`);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});
