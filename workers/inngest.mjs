import http from "node:http";
import { serve } from "inngest/node";

process.env.DEMOFORGE_TARGET ||= "worker";

const { inngest } = await import("../lib/inngest/client.ts");
const { handleExportJob } = await import("../lib/inngest/functions.ts");

const port = Number(process.env.PORT || 3001);

const inngestHandler = serve({
  client: inngest,
  functions: [handleExportJob],
});

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/health" && req.method === "GET") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "worker" }));
    return;
  }

  if (url.pathname === "/api/inngest") {
    inngestHandler(req, res);
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(port, "0.0.0.0", () => {
  console.log(`DemoForge Inngest worker listening on port ${port}`);
});
