#!/usr/bin/env python3
"""Regenerate llms-full.txt from the core documentation files.

    python3 scripts/gen_llms_full.py           # write llms-full.txt
    python3 scripts/gen_llms_full.py --check   # fail when it is stale

llms.txt (the concise index) is edited by hand; this file aggregates the
sources below, in this order, under one SOURCE banner each.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    "README.md",
    "docs/getting-started.md",
    "docs/architecture.md",
    "docs/api.md",
    "docs/faq.md",
    "docs/troubleshooting.md",
    "docs/Overview.md",
    "docs/DataFlow.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
]
BAR = "<!-- ============================================================ -->"


def render() -> str:
    out = [
        "# AbstractEntity — full documentation (llms-full.txt)\n\n",
        "> Generated from " + " + ".join(SOURCES)
        + ". The AI-readable single-file corpus; see llms.txt for the concise index.\n\n",
    ]
    for rel in SOURCES:
        path = ROOT / rel
        if not path.is_file():
            raise SystemExit(f"missing source: {rel}")
        out.append(f"\n{BAR}\n<!-- SOURCE: {rel} -->\n{BAR}\n\n")
        out.append(path.read_text(encoding="utf-8") + "\n")
    return "".join(out)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true", help="fail when llms-full.txt is stale")
    args = parser.parse_args()
    target = ROOT / "llms-full.txt"
    expected = render()
    if args.check:
        if target.read_text(encoding="utf-8") != expected:
            sys.exit("llms-full.txt is stale; run python3 scripts/gen_llms_full.py")
        print("llms-full.txt is current")
        return
    target.write_text(expected, encoding="utf-8")
    print(f"wrote {target} ({target.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
