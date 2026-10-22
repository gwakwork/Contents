import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

// Static document only: no API, content database, or outbound requests.
const html = readFileSync(new URL('../release/moa-local.html', import.meta.url));
const port = Number(process.env.LOCAL_PORT || 4174);
const server = createServer((request, response) => {
  if (request.method === 'GET' && ['/', '/moa-local.html'].includes(request.url)) {
    response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.length,
      'Cache-Control': 'no-store',
    });
    response.end(html);
  } else {
    response.writeHead(404);
    response.end();
  }
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Local static document is listening on port ${port}.`),
);
process.on('SIGINT', () => server.close());
process.on('SIGTERM', () => server.close());
