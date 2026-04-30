import http from "node:http";

const PORT = Number.parseInt(process.env.PORT ?? "4100", 10);

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const body = JSON.stringify({
      status: "ok",
      service: "aether-core"
    });

    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body)
    });
    res.end(body);
    return;
  }

  res.writeHead(404, {
    "content-type": "application/json"
  });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, () => {
  console.log(`aether-core listening on port ${PORT}`);
});

