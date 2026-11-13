"""开发用静态服务器: 禁用缓存, 保证刷新总是加载最新代码。用法: py tools/serve.py [port]"""
import http.server
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.test(HandlerClass=NoCacheHandler, port=port, bind="0.0.0.0")
