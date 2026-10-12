"""Restore a dump into a temporary SQLite DB; never print data or SQL errors."""
import sqlite3
import sys
import tempfile
from pathlib import Path


def validate(sql_path):
    with tempfile.TemporaryDirectory(prefix="ranking-restore-") as directory:
        with sqlite3.connect(str(Path(directory) / "database.sqlite")) as db:
            db.executescript("BEGIN;\n" + Path(sql_path).read_text(encoding="utf-8") + "\nCOMMIT;")
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if not {"song", "player", "play", "play_participant"}.issubset(tables):
                raise ValueError("Incomplete schema")
            if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
                raise ValueError("Integrity check failed")
            if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
                raise ValueError("Foreign key check failed")


if __name__ == "__main__":
    try:
        validate(sys.argv[1])
    except Exception:
        sys.exit(1)
