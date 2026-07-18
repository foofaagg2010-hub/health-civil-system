const http = require('http');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 3000;

const SECURITY_HEADERS = {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co"
};

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
    if (req.url.startsWith('/.netlify/functions/')) {
        const forwardHeaders = {};
        for (const [key, val] of Object.entries(req.headers)) {
            if (!['x-user-id'].includes(key.toLowerCase())) {
                forwardHeaders[key] = val;
            }
        }
        forwardHeaders.host = 'localhost:8888';

        const options = {
            hostname: 'localhost',
            port: 8888,
            path: req.url,
            method: req.method,
            headers: forwardHeaders
        };

        const proxyReq = http.request(options, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'API server not running. Start with: npx netlify functions:serve --port 8888' }));
        });

        req.pipe(proxyReq);
        return;
    }

    let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'index.html' : req.url);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
                if (err2) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 - Not Found');
                    return;
                }
                res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' });
                res.end(indexContent);
            });
            return;
        }

        const ext = path.extname(filePath);
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const responseHeaders = { ...SECURITY_HEADERS, 'Content-Type': contentType };
        res.writeHead(200, responseHeaders);
        res.end(content);
    });
});

server.listen(PORT, () => {
    console.log(`\n✅ السيرفر شغال على: http://localhost:${PORT}`);
    console.log(`⚠️  API Functions تحتاج: npx netlify functions:serve --port 8888\n`);
});
