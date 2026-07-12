#!/usr/bin/env python3
"""
Convert Clash / Mihomo YAML vmess proxies to vmess:// share links.

Usage:
  python3 clash_to_vmess.py clash.yaml vmess.txt
  python3 clash_to_vmess.py clash.yaml vmess.txt --line-mode space
  python3 clash_to_vmess.py clash.yaml vmess.txt --name-filter Finland

Notes:
  - Preserves WebSocket path query strings such as /10044?ed=2048.
  - Preserves WebSocket Host header from ws-opts.headers.Host / host.
  - Maps Clash gRPC service name to vmess JSON "path".
  - Maps Clash servername/SNI to vmess JSON "host" for gRPC nodes,
    matching common v2rayN/vmess subscription style.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
from pathlib import Path
from typing import Any, Iterable

try:
    import yaml  # type: ignore
except ImportError:  # pragma: no cover
    yaml = None


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return bool(value)
    return str(value).strip().lower() in {"1", "true", "yes", "y", "on", "tls"}


def first_present(mapping: dict[str, Any] | None, keys: Iterable[str], default: Any = "") -> Any:
    if not mapping:
        return default
    for key in keys:
        if key in mapping and mapping[key] not in (None, ""):
            return mapping[key]
        # Clash configs often vary header case: Host / host / HOST
        for actual_key, value in mapping.items():
            if actual_key.lower() == key.lower() and value not in (None, ""):
                return value
    return default


def normalize_path(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return str(value[0]) if value else ""
    return str(value)


def get_ws_host(proxy: dict[str, Any]) -> str:
    ws_opts = proxy.get("ws-opts") or {}
    headers = ws_opts.get("headers") or {}
    return str(first_present(headers, ["Host", "host", ":authority"], ""))


def get_ws_path(proxy: dict[str, Any]) -> str:
    ws_opts = proxy.get("ws-opts") or {}
    return normalize_path(ws_opts.get("path", ""))


def get_grpc_host(proxy: dict[str, Any]) -> str:
    grpc_opts = proxy.get("grpc-opts") or {}
    return str(
        first_present(
            grpc_opts,
            ["grpc-authority", "authority"],
            proxy.get("servername") or proxy.get("sni") or "",
        )
    )


def get_grpc_path(proxy: dict[str, Any]) -> str:
    grpc_opts = proxy.get("grpc-opts") or {}
    return normalize_path(first_present(grpc_opts, ["grpc-service-name", "serviceName"], ""))


def get_h2_host(proxy: dict[str, Any]) -> str:
    h2_opts = proxy.get("h2-opts") or {}
    host = h2_opts.get("host") or proxy.get("servername") or proxy.get("sni") or ""
    if isinstance(host, list):
        return ",".join(str(x) for x in host)
    return str(host)


def get_h2_path(proxy: dict[str, Any]) -> str:
    h2_opts = proxy.get("h2-opts") or {}
    return normalize_path(h2_opts.get("path", ""))


def get_http_host(proxy: dict[str, Any]) -> str:
    http_opts = proxy.get("http-opts") or {}
    headers = http_opts.get("headers") or {}
    return str(first_present(headers, ["Host", "host"], proxy.get("servername") or proxy.get("sni") or ""))


def get_http_path(proxy: dict[str, Any]) -> str:
    http_opts = proxy.get("http-opts") or {}
    return normalize_path(http_opts.get("path", ""))


def clash_vmess_to_vmess_json(proxy: dict[str, Any], include_extra: bool = False) -> dict[str, Any]:
    network = str(proxy.get("network") or "tcp").lower()
    tls_enabled = as_bool(proxy.get("tls"))

    host = ""
    path = ""
    if network == "ws":
        host = get_ws_host(proxy)
        path = get_ws_path(proxy)
    elif network == "grpc":
        host = get_grpc_host(proxy)
        path = get_grpc_path(proxy)
    elif network == "h2":
        host = get_h2_host(proxy)
        path = get_h2_path(proxy)
    elif network == "http":
        host = get_http_host(proxy)
        path = get_http_path(proxy)
    else:
        host = str(proxy.get("servername") or proxy.get("sni") or "")

    vmess: dict[str, Any] = {
        "v": "2",
        "ps": str(proxy.get("name") or ""),
        "add": str(proxy.get("server") or ""),
        "port": str(proxy.get("port") or ""),
        "id": str(proxy.get("uuid") or ""),
        "aid": int(proxy.get("alterId") or 0),
        "net": network,
        "type": str(proxy.get("network-type") or proxy.get("type-opts") or "none"),
        "host": host,
        "path": path,
        "tls": "tls" if tls_enabled else "none",
    }

    # Extra fields are useful for clients that understand newer vmess JSON variants.
    # They are disabled by default to maximize compatibility with classic vmess.txt importers.
    if include_extra:
        cipher = proxy.get("cipher")
        if cipher:
            vmess["scy"] = str(cipher)
        sni = proxy.get("servername") or proxy.get("sni")
        if tls_enabled and sni:
            vmess["sni"] = str(sni)
        alpn = proxy.get("alpn")
        if alpn:
            vmess["alpn"] = ",".join(alpn) if isinstance(alpn, list) else str(alpn)
        fp = proxy.get("client-fingerprint") or proxy.get("fingerprint")
        if fp:
            vmess["fp"] = str(fp)

    missing = [k for k in ("ps", "add", "port", "id") if not vmess[k]]
    if missing:
        raise ValueError(f"proxy {proxy.get('name')!r} missing required fields: {', '.join(missing)}")

    return vmess


def to_vmess_link(vmess_json: dict[str, Any]) -> str:
    # Keep Unicode names readable before encoding; compact JSON avoids unnecessary spaces.
    raw = json.dumps(vmess_json, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded = base64.b64encode(raw).decode("ascii")
    return "vmess://" + encoded


def load_clash(path: Path) -> dict[str, Any]:
    if yaml is None:
        raise RuntimeError("Missing dependency: PyYAML. Install it with: python3 -m pip install PyYAML")
    with path.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    if not isinstance(data, dict):
        raise ValueError("input is not a Clash YAML mapping")
    return data


def iter_vmess_proxies(data: dict[str, Any]) -> Iterable[dict[str, Any]]:
    proxies = data.get("proxies") or []
    if not isinstance(proxies, list):
        raise ValueError("Clash YAML field 'proxies' is not a list")
    for proxy in proxies:
        if isinstance(proxy, dict) and str(proxy.get("type", "")).lower() == "vmess":
            yield proxy


def main() -> int:
    parser = argparse.ArgumentParser(description="Convert Clash/Mihomo vmess proxies to vmess:// links.")
    parser.add_argument("input", type=Path, help="input Clash/Mihomo YAML file")
    parser.add_argument("output", type=Path, help="output vmess.txt file")
    parser.add_argument(
        "--line-mode",
        choices=["space", "newline"],
        default="newline",
        help="vmess.txt separator; daed-style subscription files often use space, default: newline",
    )
    parser.add_argument("--name-filter", help="only convert nodes whose name contains this text")
    parser.add_argument("--include-extra", action="store_true", help="include optional fields: scy, sni, alpn, fp")
    parser.add_argument("--dry-run", action="store_true", help="print decoded JSON instead of writing links")
    args = parser.parse_args()

    data = load_clash(args.input)
    links: list[str] = []
    decoded: list[dict[str, Any]] = []
    skipped = 0

    for proxy in iter_vmess_proxies(data):
        name = str(proxy.get("name") or "")
        if args.name_filter and args.name_filter not in name:
            skipped += 1
            continue
        try:
            vmess_json = clash_vmess_to_vmess_json(proxy, include_extra=args.include_extra)
        except Exception as e:
            print(f"warning: skipped {name!r}: {e}", file=sys.stderr)
            skipped += 1
            continue
        decoded.append(vmess_json)
        links.append(f"{name}:{to_vmess_link(vmess_json)}")

    if args.dry_run:
        print(json.dumps(decoded, ensure_ascii=False, indent=2))
        print(f"converted={len(decoded)} skipped={skipped}", file=sys.stderr)
        return 0

    sep = "\n" if args.line_mode == "newline" else " "
    args.output.write_text(sep.join(links) + "\n", encoding="utf-8")
    print(f"converted={len(links)} skipped={skipped} output={args.output}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
