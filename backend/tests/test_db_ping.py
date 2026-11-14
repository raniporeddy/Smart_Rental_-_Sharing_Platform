"""Utility script to verify connectivity to TiDB Cloud or MySQL database."""

import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

from backend.config import Config, normalize_database_url, build_engine_options


def verify_db_connection(database_url=None):
    url = database_url or Config.SQLALCHEMY_DATABASE_URI
    if not url:
        print("[FAIL] DATABASE_URL is not set.")
        return False

    normalized_url = normalize_database_url(url)
    engine_opts = build_engine_options(normalized_url)

    # Obfuscate password for display
    display_url = normalized_url
    if "@" in display_url and ":" in display_url.split("@")[0]:
        prefix, rest = display_url.split("@", 1)
        scheme_user, _ = prefix.rsplit(":", 1)
        display_url = f"{scheme_user}:****@{rest}"

    print(f"[*] Testing connection to: {display_url}")
    print(f"[*] Engine options: {engine_opts}")

    try:
        engine = create_engine(normalized_url, **engine_opts)
        with engine.connect() as conn:
            try:
                version = conn.execute(text("SELECT VERSION()")).scalar()
            except Exception:
                version = conn.execute(text("SELECT 1")).scalar()
            print(f"[OK] Connection successful! Database response: {version}")
            return True
    except Exception as exc:
        print(f"[FAIL] Unable to connect to database: {exc}")
        return False


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else None
    success = verify_db_connection(target)
    sys.exit(0 if success else 1)
