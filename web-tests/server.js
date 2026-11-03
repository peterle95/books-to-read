const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/books-to-read/')) return res.writeHead(404).end();
  const name = url.pathname.slice('/books-to-read/'.length) || 'index.html';
  if (name.includes('/') || name.includes('\\')) return res.writeHead(404).end();
  const file = path.join(__dirname, '..', 'web', name);
  fs.readFile(file, (error, data) => {
    if (error) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
}).listen(4173, '127.0.0.1');
