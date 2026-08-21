const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3010);
const publicDir = path.join(__dirname, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const wanted = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.normalize(path.join(publicDir, wanted));
  if (file.startsWith(publicDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    return fs.createReadStream(file).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(path.join(publicDir, 'index.html')).pipe(res);
});

server.listen(port, '0.0.0.0', () => console.log(`Yasnafit is running at http://localhost:${port}`));
