import http from "node:http";

const target = "http://127.0.0.1:3000";
const allowedPath = "/api/webhooks/whatsapp";

http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== allowedPath || !["GET", "POST"].includes(request.method ?? "")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end('{"error":"not_found"}');
    return;
  }
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const upstream = await fetch(`${target}${url.pathname}${url.search}`, {
    method: request.method,
    headers: { "content-type": request.headers["content-type"] ?? "application/json", "x-hub-signature-256": request.headers["x-hub-signature-256"] ?? "" },
    body: request.method === "POST" ? Buffer.concat(chunks) : undefined,
  });
  response.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}).listen(3100, "127.0.0.1");
