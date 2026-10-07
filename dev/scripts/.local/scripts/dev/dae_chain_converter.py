#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SAFE_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_.+\-]*$")
SAFE_BARE = SAFE_IDENT


class ConversionError(ValueError):
    pass


def effective_lines(text: str):
    return [
        (n, raw.strip())
        for n, raw in enumerate(text.splitlines(), 1)
        if raw.strip() and not raw.lstrip().startswith("#")
    ]


def parse_record(line: str, line_no: int, protocol: str):
    marker = f":{protocol}://"
    i = line.find(marker)
    if i <= 0:
        raise ConversionError(f"第 {line_no} 行应为 name:{protocol}://...")

    name = line[:i].strip()
    url = line[i + 1 :].strip()
    if not name:
        raise ConversionError(f"第 {line_no} 行 name 为空")
    return name, url


def normalize_chain_name(name: str, landing_name: str):
    warnings = []
    out = f"{name}-{landing_name}"

    # dae outbound uses "<overwritten-name>:<linklike>" and splits on the
    # first colon. A literal ':' cannot therefore survive inside the name.
    if ":" in out:
        out = out.replace(":", "：")
        warnings.append(
            f"名称 {name!r} 含 ':'，已替换为全角 '：'，避免与 dae 名称前缀分隔符冲突"
        )
    return out, warnings


def dae_quote(value: str) -> str:
    # dae's parser currently strips the outer quotes but does not unescape
    # escaped inner quotes. Use a delimiter absent from the value.
    if "'" not in value:
        return "'" + value + "'"
    if '"' not in value:
        return '"' + value + '"'
    raise ConversionError(
        "某个名称或链接同时包含单引号和双引号，无法在不改变运行时字符串的情况下安全写入 dae 配置"
    )


def dae_name_literal(name: str) -> str:
    if SAFE_BARE.fullmatch(name):
        return name
    return dae_quote(name)


def validate_ident(value: str, label: str):
    if not SAFE_IDENT.fullmatch(value):
        raise ConversionError(
            f"{label} {value!r} 不符合安全格式 [A-Za-z_][A-Za-z0-9_.+-]*"
        )


def convert(text: str, group_name: str = "chain-proxy", policy: str = "min_moving_avg"):
    validate_ident(group_name, "group 名称")
    validate_ident(policy, "policy")

    lines = effective_lines(text)
    if len(lines) < 2:
        raise ConversionError("至少需要 1 条 jp:vless://... 和 1 条 name:vmess://...")

    first_no, first_line = lines[0]
    landing_name, landing_url = parse_record(first_line, first_no, "vless")
    if landing_name != "jp":
        raise ConversionError(
            f"第一条有效记录的 name 必须是 jp，实际为 {landing_name!r}"
        )

    node_lines = []
    filter_names = []
    seen = set()
    warnings = []

    for line_no, line in lines[1:]:
        name, url = parse_record(line, line_no, "vmess")
        chain_name, ws = normalize_chain_name(name, landing_name)
        warnings.extend(ws)

        # This is an unkeyed node literal. The prefix before the first colon
        # is consumed by dae outbound as overwrittenName.
        chain = f"{chain_name}:{landing_url} -> {url}"
        node_lines.append(f"    {dae_quote(chain)}")

        if chain_name not in seen:
            seen.add(chain_name)
            filter_names.append(chain_name)
        else:
            warnings.append(
                f"检测到重复链名称 {chain_name!r}；group 中只保留一条 name()，仍会匹配所有同名节点"
            )

    filter_lines = [
        f"        filter: name({dae_name_literal(name)})"
        for name in filter_names
    ]

    output = "\n".join([
        "node {",
        *node_lines,
        "}",
        "",
        "group {",
        f"    {group_name} {{",
        *filter_lines,
        f"        policy: {policy}",
        "    }",
        "}",
    ])
    return output, warnings


def main():
    ap = argparse.ArgumentParser(
        description="生成 dae 链式 node 和对应 group/name() 过滤规则"
    )
    ap.add_argument("file", nargs="?", help="输入文件；省略时从 stdin 读取")
    ap.add_argument("--group-name", default="chain-proxy")
    ap.add_argument("--policy", default="min_moving_avg")
    args = ap.parse_args()

    try:
        text = (
            Path(args.file).read_text(encoding="utf-8")
            if args.file
            else sys.stdin.read()
        )
        result, warnings = convert(text, args.group_name, args.policy)
        print(result)
        for w in warnings:
            print(f"warning: {w}", file=sys.stderr)
        return 0
    except (OSError, ConversionError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
