#!/usr/bin/env python3
"""
Touch Map Conflict Check Gate — CI check that flags file overlaps between
active phase branches.

Compares changed files in the current PR branch against all other active
phase branches registered in Dolt's phase_assignments table.
"""

import os
import sys
import subprocess

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


def write_output(key, value):
    """Write a key=value pair to $GITHUB_OUTPUT if available."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a") as f:
            f.write(f"{key}={value}\n")


def get_pr_branch():
    """Get current branch name."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError:
        return None


def get_changed_files_for_branch(branch=None):
    """Get files changed between origin/main and a branch.

    If branch is None, uses HEAD (current branch).
    """
    ref = branch if branch else "HEAD"
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", f"origin/main...{ref}"],
            capture_output=True,
            text=True,
            check=True,
        )
        return [f.strip() for f in result.stdout.strip().split("\n") if f.strip()]
    except subprocess.CalledProcessError:
        return []


def check_touch_map_conflicts():
    """Check for file-level overlaps between the current PR branch and other active branches."""
    current_branch = get_pr_branch()
    if not current_branch:
        print("WARNING: Could not determine current branch. Skipping conflict check.")
        write_output("result", "skip")
        return True

    # Get current branch's changed files
    current_files = set(get_changed_files_for_branch())
    if not current_files:
        print("No changed files in current branch. No conflicts possible.")
        write_output("result", "pass")
        return True

    # Get active phase assignments from Dolt
    try:
        conn = get_dolt_connection()
    except Exception as e:
        print(f"WARNING: Could not connect to Dolt: {e}")
        print("Skipping touch map conflict check (Dolt not available)")
        write_output("result", "skip")
        return True

    conflicts = []

    try:
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT phase_id, branch_name, status, assignee "
                "FROM phase_assignments "
                "WHERE status IN ('assigned', 'in_progress', 'pr_open')"
            )
            assignments = cursor.fetchall()
    finally:
        conn.close()

    # Compare against each other active branch
    for assignment in assignments:
        other_branch = assignment["branch_name"]
        if not other_branch or other_branch == current_branch:
            continue

        try:
            other_files = set(get_changed_files_for_branch(other_branch))
        except Exception:
            # Branch might not exist locally
            continue

        overlap = current_files & other_files
        if overlap:
            conflicts.append({
                "phase_id": assignment["phase_id"],
                "branch": other_branch,
                "assignee": assignment.get("assignee", "unknown"),
                "status": assignment["status"],
                "overlapping_files": sorted(overlap),
            })

    if not conflicts:
        print("No touch map conflicts detected. Gate passes.")
        write_output("result", "pass")
        return True

    # Report conflicts
    print("TOUCH MAP CONFLICT CHECK FAILED")
    print("=" * 60)
    print(f"Current branch ({current_branch}) has file overlaps with {len(conflicts)} other branch(es):")
    print()
    for conflict in conflicts:
        print(f"  Phase {conflict['phase_id']} ({conflict['branch']}) [{conflict['status']}]")
        print(f"    Assignee: {conflict['assignee']}")
        print(f"    Overlapping files ({len(conflict['overlapping_files'])}):")
        for f in conflict["overlapping_files"]:
            print(f"      - {f}")
        print()
    print("Resolve file ownership conflicts before merging.")
    print("Use: forge lock <file> --phase <N> to claim advisory locks.")
    write_output("result", "fail")
    return False


def main():
    print("Checking touch map conflicts...")
    if check_touch_map_conflicts():
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
