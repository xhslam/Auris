const net = require("node:net");
const http = require("node:http");

function tryListen(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.once("listening", () => {
      const address = server.address();
      const resolvedPort =
        address && typeof address === "object" && "port" in address ? address.port : port;

      server.close(() => {
        resolve(resolvedPort);
      });
    });

    // The desktop renderer always binds to IPv4 loopback. Probe that exact
    // address as macOS may otherwise reserve only the IPv6 wildcard and report
    // a false positive while 127.0.0.1 is already occupied.
    server.listen(port, "127.0.0.1");
  });
}

async function findOpenPort(preferredPort = 3000, attempts = 20) {
  for (let offset = 0; offset < attempts; offset += 1) {
    const candidatePort = preferredPort + offset;

    try {
      return await tryListen(candidatePort);
    } catch {
      continue;
    }
  }

  throw new Error("Unable to find an open localhost port for the desktop app.");
}

function requestHttp(url, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({
          body,
          headers: res.headers,
          statusCode: res.statusCode ?? 0,
        });
      });
    });

    req.setTimeout(timeoutMs);
    req.once("error", reject);
    req.once("timeout", () => {
      req.destroy(new Error(`Timed out requesting ${url}.`));
    });
  });
}

async function findResponsiveServerUrl(
  ports,
  {
    path = "/",
    timeoutMs = 1000,
    validateResponse = (response) => response.statusCode >= 200 && response.statusCode < 500,
  } = {},
) {
  for (const port of ports) {
    try {
      const response = await requestHttp(`http://127.0.0.1:${port}${path}`, timeoutMs);

      if (validateResponse(response)) {
        return `http://127.0.0.1:${port}`;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function waitForPort(port, timeoutMs = 90000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function poll() {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        // Any HTTP response (even 404) means the server is up and serving
        res.resume();
        resolve();
      });

      req.setTimeout(1000);

      req.once("error", () => {
        req.destroy();

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for localhost:${port}.`));
          return;
        }

        setTimeout(poll, 500);
      });

      req.once("timeout", () => {
        req.destroy();

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for localhost:${port}.`));
          return;
        }

        setTimeout(poll, 500);
      });
    }

    poll();
  });
}

module.exports = {
  findResponsiveServerUrl,
  findOpenPort,
  waitForPort,
};
