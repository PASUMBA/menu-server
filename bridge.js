import http from 'http';
import httpProxy from 'http-proxy';

const proxy = httpProxy.createProxyServer({});

const server = http.createServer((req, res) => {
  // Forward incoming traffic on port 8080 to Node server on port 3000
  proxy.web(req, res, { target: 'http://127.0.0.1:3000' }, (err) => {
    console.error('Bridge error:', err.message);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Bridge routing error.');
  });
});

server.listen(8080, '0.0.0.0', () => {
  console.log('Node Relay Bridge running on http://192.168.1.42:8080');
});