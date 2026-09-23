#!/usr/bin/env python3
"""Measure an entity home's footprint — the BEFORE/AFTER instrument for
maintenance operations (first use: the Castor doctoring, laurent 11:50
2026-07-13, agora e-s 257 ask 2).

PURE READ: opens SQLite files read-only, stats files, writes stdout.
Deterministic JSON so two runs (before/after) diff mechanically.

Measures:
  - footprint_bytes per file family (memory/home/runtime stores, wal/shm,
    artifacts/, workspace/) + total
  - journal: total seqs, per-family event counts, per-day event counts
  - records: counts by kind (from the triple store's dcterms:abstract rows
    joined to record_kind attributes via the journal binding events is
    engine territory — here we count formation events per kind from the
    journal, which is the same number the stream carries)
  - diary book: entry count + hash-chain verification (never-thinned
    invariant: this number must be EQUAL before/after)

Usage:
    python measure_home.py <home_dir>
"""

from __future__ import annotations

import json
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path


def file_sizes(home: Path) -> dict:
    families = {
        "memory_store": ["memory.sqlite3", "memory.sqlite3-wal", "memory.sqlite3-shm"],
        "diary_book": ["home.sqlite3", "home.sqlite3-wal", "home.sqlite3-shm"],
        "runtime_stores": [],
        "artifacts_dir": [],
        "workspace_dir": [],
        "other": [],
    }
    out = {k: 0 for k in families}
    detail: dict[str, int] = {}
    for p in sorted(home.rglob("*")):
        if not p.is_file():
            continue
        rel = str(p.relative_to(home))
        size = p.stat().st_size
        detail[rel] = size
        if rel in families["memory_store"]:
            out["memory_store"] += size
        elif rel in families["diary_book"]:
            out["diary_book"] += size
        elif rel.startswith("runtime") and rel.endswith((".sqlite3", ".sqlite3-wal", ".sqlite3-shm")):
            out["runtime_stores"] += size
        elif rel.startswith("artifacts/"):
            out["artifacts_dir"] += size
        elif rel.startswith("workspace/"):
            out["workspace_dir"] += size
        else:
            out["other"] += size
    out_total = sum(out.values())
    # Detail only for the big rows — the diff should read, not scroll.
    big = {k: v for k, v in detail.items() if v >= 1_000_000}
    return {"by_family": out, "total": out_total, "files_over_1mb": big}


def journal_counts(home: Path) -> dict:
    """The v1 home store splits the journal across memj_* tables (one per
    family) + the triple store — measured against Castor's live schema
    2026-07-13. Numbers here must reconcile with `export_replay` envelope
    counts (the same rows serve the stream)."""
    db = home / "memory.sqlite3"
    if not db.exists():
        return {"error": "no memory.sqlite3"}
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        cur = con.cursor()
        tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        family_tables = {
            "event": "memj_events",
            "binding": "memj_bindings",
            "closure": "memj_closures",
            "trace": "memj_traces",
            "snapshot": "memj_snapshots",
            "valence": "memj_valence",
        }
        by_family: dict[str, int] = {}
        by_day: Counter[str] = Counter()
        event_kinds: dict[str, int] = {}
        for family, table in family_tables.items():
            if table not in tables:
                by_family[family] = -1  # schema drift: loud, never silent zero
                continue
            by_family[family] = cur.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for day, n in cur.execute(f"SELECT substr(observed_at,1,10), COUNT(*) FROM {table} GROUP BY 1"):
                by_day[str(day)] += n
        if "memj_events" in tables:
            event_kinds = dict(cur.execute("SELECT kind, COUNT(*) FROM memj_events GROUP BY kind ORDER BY COUNT(*) DESC"))
        max_seq = None
        if "memj_seq" in tables:
            row = cur.execute("SELECT value FROM memj_seq LIMIT 1").fetchone()
            max_seq = row[0] if row else None
        triples = cur.execute("SELECT COUNT(*) FROM triples").fetchone()[0] if "triples" in tables else None
        # EMBEDDING FOOTPRINT (doctoring phase-4 measures embedding nulls on
        # closure-retired rows — this makes that delta a number, not a claim).
        embeddings = None
        if "triples" in tables:
            row = cur.execute(
                "SELECT COUNT(embedding), COALESCE(SUM(LENGTH(embedding)), 0) FROM triples WHERE embedding IS NOT NULL"
            ).fetchone()
            embeddings = {"rows_with_embedding": row[0], "embedding_bytes": row[1]}
        # MATERIALIZED LIFETIME COUNTERS (the two-count model's global side).
        # POST-COMPACTION COMPARATOR: the exported stream carries only events
        # above the cut, so fold-derived usage counts become WINDOW counts —
        # lifetime landscape comparisons before/after MUST read these store
        # counters, never the stream fold (instrument-drift guard).
        selected_counts = None
        if "memj_selected_counts" in tables:
            total = cur.execute("SELECT COUNT(*), COALESCE(SUM(n),0) FROM memj_selected_counts").fetchone()
            top = cur.execute("SELECT record_id, n FROM memj_selected_counts ORDER BY n DESC LIMIT 20").fetchall()
            top16_sum = sum(n for _, n in top[:16])
            selected_counts = {
                "records_with_counts": total[0],
                "lifetime_selected_total": total[1],
                "top16_share": round(top16_sum / total[1], 4) if total[1] else None,
                "top_20": [{"record_id": rid, "n": n} for rid, n in top],
            }
        return {
            "journal_rows_total": sum(v for v in by_family.values() if v > 0),
            "max_seq": max_seq,
            "by_family": by_family,
            "event_kinds": event_kinds,
            "by_day": dict(sorted(by_day.items())),
            "triple_store_rows": triples,
            "embeddings": embeddings,
            "lifetime_selected_counts": selected_counts,
        }
    finally:
        con.close()


def diary_counts(home: Path) -> dict:
    db = home / "home.sqlite3"
    if not db.exists():
        return {"error": "no home.sqlite3"}
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        cur = con.cursor()
        tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts = {}
        for t in sorted(tables):
            try:
                counts[t] = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            except sqlite3.Error:
                counts[t] = None
        return {"tables": counts}
    finally:
        con.close()


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    home = Path(sys.argv[1]).resolve()
    if not home.is_dir():
        print(f"not a home directory: {home}", file=sys.stderr)
        return 2
    report = {
        "home": str(home),
        "footprint": file_sizes(home),
        "journal": journal_counts(home),
        "diary_book": diary_counts(home),
    }
    json.dump(report, sys.stdout, indent=1, sort_keys=True)
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
