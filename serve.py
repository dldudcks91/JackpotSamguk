"""로컬 개발 서버 — http.server 에 재검증 헤더(`Cache-Control: no-cache` + ETag)를 단 것.

같은 파일명으로 그림을 갈아 끼워도 브라우저가 옛 그림을 붙들지 않는다. 서빙 루트는 이 파일 옆의 `src/`.
(TheSevenSimulationRPG/serve.py 에서 가져왔다 — 사유는 그쪽 머리말)

python serve.py [포트=8790]
"""

import http.server
import os
import socket
import socketserver
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
HOST = "::" if socket.has_ipv6 else ""   # "::" + V6ONLY 끔 = ::1 과 127.0.0.1 을 한 소켓이 받는다


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler + 재검증 헤더(`no-cache` + ETag) — 쓸 때마다 묻고, 그대로면 304."""

    protocol_version = "HTTP/1.1"   # 연결을 잇는다 — 파일 응답은 Content-Length 를 실으므로 그대로 된다

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        # 파일이면 ETag 를 단다 — 브라우저가 들고 온 것과 같으면 본문 없이 304.
        # 부모는 If-None-Match 가 오면 If-Modified-Since 를 안 보고 늘 200 을 주므로 여기서 먼저 가른다
        self._etag = None
        path = self.translate_path(self.path)
        if os.path.isfile(path):
            st = os.stat(path)
            self._etag = f'"{st.st_mtime_ns:x}-{st.st_size:x}"'
            tags = [t.strip() for t in self.headers.get("If-None-Match", "").split(",")]
            if any((t[2:] if t.startswith("W/") else t) == self._etag for t in tags):
                self.send_response(304)
                self.end_headers()
                return None
        return super().send_head()

    def end_headers(self):
        # 모든 응답에 붙는다 — 디렉터리 목록·404 까지 포함이라 예외가 안 생긴다.
        # ETag 는 이 응답의 파일 몫만 — 연결을 이어 쓰므로 다음 응답에 새지 않게 비운다
        self.send_header("Cache-Control", "no-cache")
        etag, self._etag = getattr(self, "_etag", None), None
        if etag:
            self.send_header("ETag", etag)
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    address_family = socket.AF_INET6 if socket.has_ipv6 else socket.AF_INET
    allow_reuse_address = True   # Ctrl+C 로 끈 직후 다시 띄울 때 TIME_WAIT 로 막히지 않게
    daemon_threads = True        # 브라우저가 커넥션을 물고 있어도 Ctrl+C 로 죽는다

    def server_bind(self):
        if self.address_family == socket.AF_INET6:
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


if __name__ == "__main__":
    with Server((HOST, PORT), NoCacheHandler) as httpd:
        print(f"serving {ROOT}")
        print(f"  http://localhost:{PORT}/index.html      (Cache-Control: no-cache + ETag)")
        print(f"  http://localhost:{PORT}/dev/test.html")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")
