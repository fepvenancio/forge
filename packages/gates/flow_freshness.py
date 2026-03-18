#!/usr/bin/env python3
"""
Flow Freshness Gate — CI check that blocks merge if Flows are stale.
Called by GitHub Actions on every PR.

Reads git diff, matches against flow_file_refs, checks stale flag in Dolt.
"""

import os
import sys
import subprocess
import json
import fnmatch

import pymysql


def get_dolt_connection():
    return pymysql.connect(
        host=os.environ.get("DOLT_HOST", "localhost"),
        port=int(os.environ.get("DOLT_PORT", "3306")),
        user=os.environ.get("DOLT_USER", "root"),
        password=os.environ.get("DOLT_PASSWORD", ""),
        database=os.environ.get("DOLT_DATABASE", "forge"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def get_changed_files():
    """Get files changed in the current PR."""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "origin/main...HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except subprocess.CalledProcessError:
        # Fallback: compare against HEAD~1
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1"],
            capture_output=True,
            text=True,
            check=True,
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]


def check_flow_freshness(changed_files):
    """Check if any flows covering the changed files are stale."""
    try:
        conn = get_dolt_connection()
    except Exception as e:
        print(f"WARNING: Could not connect to Dolt: {e}")
        print("Skipping flow freshness check (Dolt not available)")
        return True  # Don't block if Dolt is not available

    stale_flows = []

    try:
        with conn.cursor() as cursor:
            # Get all stale flows
            cursor.execute(
                "SELECT fr.flow_path, fr.title, fr.criticality "
                "FROM flow_registry fr "
                "WHERE fr.stale = TRUE"
            )
            all_stale = cursor.fetchall()

            if not all_stale:
                print("No stale flows found. Gate passes.")
                return True

            # Get flow file refs for stale flows
            cursor.execute(
                "SELECT fr.flow_path, fr.title, fr.criticality, ffr.file_pattern "
                "FROM flow_registry fr "
                "JOIN flow_file_refs ffr ON fr.id = ffr.flow_id "
                "WHERE fr.stale = TRUE"
            )
            stale_refs = cursor.fetchall()

            # Check if any changed files match stale flow patterns
            for ref in stale_refs:
                pattern = ref["file_pattern"]
                for changed_file in changed_files:
                    if matches_pattern(changed_file, pattern):
                        stale_flows.append({
                            "flow": ref["flow_path"],
                            "title": ref["title"],
                            "criticality": ref["criticality"],
                            "matched_file": changed_file,
                            "pattern": pattern,
                        })
    finally:
        conn.close()

    if not stale_flows:
        print(f"Found {len(all_stale)} stale flows, but none match changed files. Gate passes.")
        return True

    # Report stale flows
    print("FLOW FRESHNESS CHECK FAILED")
    print("=" * 60)
    print(f"The following stale flows cover files changed in this PR:")
    print()
    for sf in stale_flows:
        crit = f" [{sf['criticality'].upper()}]" if sf["criticality"] in ("high", "critical") else ""
        print(f"  - {sf['flow']}{crit}")
        print(f"    Title: {sf['title']}")
        print(f"    Matched: {sf['matched_file']} (pattern: {sf['pattern']})")
        print()
    print("Update the stale flows before merging, or ask the Librarian to update them.")
    print("Run: forge run --librarian-only to trigger Flow updates.")
    return False


def matches_pattern(filepath, pattern):
    """Simple glob matching for flow file patterns."""
    return fnmatch.fnmatch(filepath, pattern)


def main():
    changed_files = get_changed_files()
    if not changed_files:
        print("No changed files detected. Gate passes.")
        sys.exit(0)

    print(f"Checking flow freshness for {len(changed_files)} changed files...")
    if check_flow_freshness(changed_files):
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
