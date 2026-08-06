#!/usr/bin/env python3
"""Launch Skystrike with Python's built-in web server."""
from __future__ import annotations

import contextlib
import http.server
import os
import socket
import socketserver
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def choose_port(start: int = 8080) -> int:
    for port in range(start, start + 30):
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("No available local port found.")


def main() -> None:
    os.chdir(ROOT)
    port = choose_port()
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), handler) as server:
        url = f"http://127.0.0.1:{port}"
        print(f"Skystrike is running at {url}")
        print("Keep this window open while playing. Press Ctrl+C to stop.")
        threading.Thread(target=lambda: (time.sleep(0.7), webbrowser.open(url)), daemon=True).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nSkystrike server stopped.")


if __name__ == "__main__":
    main()
