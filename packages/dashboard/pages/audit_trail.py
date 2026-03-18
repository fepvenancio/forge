"""
Audit Trail — Timeline view of stage runs and artifacts.
"""

import streamlit as st
import pandas as pd
import pymysql
import os
import json
from datetime import datetime

st.set_page_config(page_title="Audit Trail — Forge", layout="wide")
st.title("Audit Trail")


def get_connection():
    return pymysql.connect(
        host=os.environ.get("DOLT_HOST", "localhost"),
        port=int(os.environ.get("DOLT_PORT", "3306")),
        user=os.environ.get("DOLT_USER", "root"),
        password=os.environ.get("DOLT_PASSWORD", ""),
        database=os.environ.get("DOLT_DATABASE", "forge"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def load_cycles():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM cycles ORDER BY started_at DESC LIMIT 20")
            return cursor.fetchall()
    except:
        return []
    finally:
        try:
            conn.close()
        except:
            pass


def load_stage_runs(cycle_id):
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM stage_runs WHERE cycle_id = %s ORDER BY started_at ASC",
                [cycle_id],
            )
            return cursor.fetchall()
    except:
        return []
    finally:
        try:
            conn.close()
        except:
            pass


def load_work_logs(task_id):
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM work_logs WHERE task_id = %s ORDER BY logged_at ASC",
                [task_id],
            )
            return cursor.fetchall()
    except:
        return []
    finally:
        try:
            conn.close()
        except:
            pass


def load_artifact(artifact_id):
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM artifacts WHERE id = %s", [artifact_id])
            row = cursor.fetchone()
            if row and os.path.exists(row["file_path"]):
                with open(row["file_path"]) as f:
                    return json.load(f)
            return row
    except:
        return None
    finally:
        try:
            conn.close()
        except:
            pass


# Cycle selector
cycles = load_cycles()
if not cycles:
    st.info("No cycles found.")
    st.stop()

cycle_options = [
    f"{c['id'][:8]}... — {c['status']} — {datetime.fromtimestamp(c['started_at'] / 1000).strftime('%Y-%m-%d %H:%M')}"
    for c in cycles
]
selected_idx = st.selectbox("Select Cycle", range(len(cycle_options)), format_func=lambda i: cycle_options[i])
selected_cycle = cycles[selected_idx]

st.markdown(f"### Cycle `{selected_cycle['id']}`")
st.markdown(f"**Status:** {selected_cycle['status']} | **Model:** {selected_cycle.get('planner_model', 'N/A')}")

# Stage runs timeline
stage_runs = load_stage_runs(selected_cycle["id"])
if stage_runs:
    st.markdown("### Stage Runs")
    for run in stage_runs:
        started = datetime.fromtimestamp(run["started_at"] / 1000).strftime("%H:%M:%S") if run["started_at"] else "?"
        duration = ""
        if run["finished_at"] and run["started_at"]:
            dur_s = (run["finished_at"] - run["started_at"]) / 1000
            duration = f" ({dur_s:.1f}s)"

        status_icon = {"pass": "✅", "fail": "❌", "gap": "⚠️", "blocked": "🔒", "skipped": "⏭️"}.get(
            run["outcome"] or "", "⏳"
        )

        with st.expander(f"{status_icon} {run['stage']} — {run['model']}{duration} [{started}]"):
            st.json(run)

            # Show artifact if available
            if run["artifact_id"]:
                artifact = load_artifact(run["artifact_id"])
                if artifact:
                    st.markdown("**Artifact:**")
                    st.json(artifact)

            # Show work logs for workers
            if run["stage"] == "worker":
                logs = load_work_logs(run["task_id"])
                if logs:
                    st.markdown("**Work Log:**")
                    for log in logs:
                        ts = datetime.fromtimestamp(log["logged_at"] / 1000).strftime("%H:%M:%S")
                        st.text(f"[{ts}] {log['action']}: {log.get('detail', '')}")
else:
    st.info("No stage runs found for this cycle.")
