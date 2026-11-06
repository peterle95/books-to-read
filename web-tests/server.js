const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2' };
let serviceWorkerDeployments = 0;
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/books-to-read/')) return res.writeHead(404).end();
  const name = url.pathname.slice('/books-to-read/'.length) || 'index.html';
  if ((name.includes('/') && !/^assets\/android\/[A-Za-z0-9._-]+$/.test(name)) || name.includes('\\')) return res.writeHead(404).end();
  // Lets a test publish a new service-worker version without touching the working tree.
  if (name === '__bump-sw') {
    serviceWorkerDeployments += 1;
    return res.writeHead(204).end();
  }
  const file = path.join(__dirname, '..', 'web', name);
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    if (name === 'sw.js' && serviceWorkerDeployments) data = Buffer.concat([data, Buffer.from(`\n// test deployment ${serviceWorkerDeployments}\n`)]);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
}).listen(Number(process.env.PLAYWRIGHT_PORT || 4173), '127.0.0.1');
