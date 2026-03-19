#!/usr/bin/env python3
"""
Cost Audit Gate — CI check that reports phase cost data from Dolt.

Queries developer_costs table for the current phase and reports spend.
Does not enforce budget thresholds (that's Phase 4 COST-04).
Gracefully degrades when Dolt is unavailable.
"""

import os
import re
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


def get_phase_from_branch():
    """Extract phase number from branch name matching gsd/phase-{N}-* pattern.

    Returns int phase number or None if not a phase branch.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        branch = result.stdout.strip()
    except subprocess.CalledProcessError:
        return None

    match = re.match(r"gsd/phase-(\d+)", branch)
    if match:
        return int(match.group(1))
    return None


def check_cost_audit():
    """Check cost data for the current phase."""
    phase_id = get_phase_from_branch()

    if phase_id is None:
        print("Not a phase branch, skipping cost audit.")
        write_output("result", "skip")
        return True

    try:
        conn = get_dolt_connection()
    except Exception as e:
        print(f"WARNING: Could not connect to Dolt: {e}")
        print("Skipping cost audit (Dolt not available)")
        write_output("result", "skip")
        return True

    try:
        with conn.cursor() as cursor:
            # Get total cost for this phase
            cursor.execute(
                "SELECT SUM(cost_usd) as total_cost, COUNT(*) as record_count "
                "FROM developer_costs WHERE phase_id = %s",
                (phase_id,),
            )
            row = cursor.fetchone()

            if not row or row["record_count"] == 0 or row["total_cost"] is None:
                print(f"WARNING: No cost data for phase {phase_id}. Cost tracking not yet active.")
                write_output("result", "warn")
                return True

            total_cost = float(row["total_cost"])
            record_count = row["record_count"]

            # Get per-model breakdown
            cursor.execute(
                "SELECT model, SUM(cost_usd) as model_cost, "
                "SUM(input_tokens) as total_input, SUM(output_tokens) as total_output "
                "FROM developer_costs WHERE phase_id = %s GROUP BY model",
                (phase_id,),
            )
            model_breakdown = cursor.fetchall()

            print("COST AUDIT REPORT")
            print("=" * 60)
            print(f"Phase {phase_id} — Total spend: ${total_cost:.4f} ({record_count} records)")
            print()
            if model_breakdown:
                print("  Per-model breakdown:")
                for mb in model_breakdown:
                    print(
                        f"    {mb['model']}: ${float(mb['model_cost']):.4f} "
                        f"(in: {mb['total_input']:,} / out: {mb['total_output']:,} tokens)"
                    )
            print()
            print("No budget threshold enforcement yet (Phase 4 COST-04).")
            write_output("result", "pass")
            return True
    finally:
        conn.close()


def main():
    print("Running cost audit...")
    if check_cost_audit():
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
