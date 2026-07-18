// server.js - تشغيل محلي بدون netlify dev
const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 3000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
    // API Proxy - forward requests to Netlify Functions
    if (req.url.startsWith('/.netlify/functions/')) {
        const options = {
            hostname: 'localhost',
            port: 8888,
            path: req.url,
            method: req.method,
            headers: { ...req.headers, host: 'localhost:8888' }
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'API server not running. Start with: npx netlify functions:serve --port 8888' }));
        });

        req.pipe(proxyReq);
        return;
    }

    // Serve static files
    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            // إذا الملف غير موجود، ارسل index.html (للدعم الـ SPA)
            fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
                if (err2) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 - Not Found');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(indexContent);
            });
            return;
        }

        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(content);
    });
});

server.listen(PORT, () => {
    console.log(`\n✅ السيرفر شغال على: http://localhost:${PORT}`);
    console.log(`⚠️  API Functions تحتاج: npx netlify functions:serve --port 8888\n`);
});
