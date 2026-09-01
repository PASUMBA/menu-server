import http.server
import socketserver
import urllib.request

PORT = 8080
TARGET_URL = "http://localhost:3000/api/translate"

class RelayHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        
        req = urllib.request.Request(
            TARGET_URL, 
            data=post_data, 
            headers={'Content-Type': 'application/json'}
        )
        
        try:
            with urllib.request.urlopen(req) as response:
                res_body = response.read()
                self.send_response(response.status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(res_body)
        except Exception as e:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(str(e).encode())

with socketserver.TCPServer(("0.0.0.0", PORT), RelayHandler) as httpd:
    print(f"Relay bridge running on http://192.168.1.42:{PORT}")
    httpd.serve_forever()