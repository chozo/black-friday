// ローカル確認用の静的サーバー（依存なし）。 npm run dev / npm run serve
// PC: http://localhost:<PORT>/   同じWi-Fiのスマホ: 表示される http://<LANのIP>:<PORT>/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 5173;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const BLOCK = /^\/(node_modules|tools|tests|\.)/;

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (BLOCK.test(p)) { res.writeHead(404).end('not found'); return; }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  // 見つからなければ public/ の同じパス（公開時は public/ の中身が <slug>/ 直下に並ぶのと同じ）
  fs.readFile(file, (err, buf) => {
    if (err) {
      const pub = path.join(ROOT, 'public', p);
      if (!pub.startsWith(path.join(ROOT, 'public') + path.sep)) { res.writeHead(404).end('not found'); return; }
      fs.readFile(pub, (e2, b2) => {
        if (e2) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(pub)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        res.end(b2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log(`黒に塗りつぶせ: http://localhost:${PORT}/`);
  for (const ifs of Object.values(os.networkInterfaces())) for (const a of ifs || [])
    if (a.family === 'IPv4' && !a.internal) console.log(`  スマホ（同じWi-Fi）: http://${a.address}:${PORT}/`);
});
