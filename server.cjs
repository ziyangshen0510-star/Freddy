'use strict';

// No dependencies or build step: the same files can go to any static host.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const publicFiles = new Set(['index.html', 'styles.css', 'assets/paw.svg', 'pet/index.html', 'pet/pet.css', 'pet/pet.js', 'pet/room-style.css', 'pet/room-style.js', 'pet/manifest.webmanifest', 'pet/sw.js', 'pet/icon.svg', 'pet/icon-192.png', 'pet/icon-512.png', 'pet/puppy-awake.png', 'pet/puppy-asleep.png', 'pet/puppy-world.bundle.js', 'pet/puppy-world.bundle.js.LEGAL.txt']);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json; charset=utf-8' };
const port = Number(process.env.PORT || 3000);

http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400); res.end('Bad request'); return; }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
  }
  if (pathname === '/pet') { res.writeHead(301, { Location: '/pet/' }); res.end(); return; }
  const filename = pathname === '/' ? 'index.html' : pathname === '/pet/' ? 'pet/index.html' : pathname.replace(/^\/+/, '');
  if (!publicFiles.has(filename)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not found'); return;
  }
  fs.readFile(path.join(root, filename), (error, data) => {
    if (error) { res.writeHead(500); res.end('Unable to read file'); return; }
    res.writeHead(200, {
      'Content-Type': mime[path.extname(filename)],
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}).listen(port, '0.0.0.0', () => console.log(`小黑陪你 is running on port ${port}`));
