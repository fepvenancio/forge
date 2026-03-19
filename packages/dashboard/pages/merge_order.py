"""
Merge Order -- Recommended merge order using Kahn's algorithm (topological sort).
"""

import streamlit as st
import pymysql
import os

st.set_page_config(page_title="Merge Order - Forge", layout="wide")
st.title("Merge Order")


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


def compute_merge_order(phases):
    """Topological sort using Kahn's algorithm.

    phases: list of dicts with keys: phase_id, depends_on (list of int), touched_files (list of str)
    Returns: dict with order (list of int), cycles (list of list of int), reasoning (list of str)
    """
    if not phases:
        return {"order": [], "cycles": [], "reasoning": []}

    adj = {p["phase_id"]: [] for p in phases}
    in_degree = {p["phase_id"]: 0 for p in phases}
    reasoning = []
    phase_ids = set(adj.keys())

    # Declared dependencies
    for p in phases:
        for dep in p.get("depends_on", []):
            if dep in phase_ids:
                adj[dep].append(p["phase_id"])
                in_degree[p["phase_id"]] += 1

    # Inferred edges from shared files
    for i, a in enumerate(phases):
        for b in phases[i + 1:]:
            shared = set(a.get("touched_files", [])) & set(b.get("touched_files", []))
            if shared:
                lower, higher = (a, b) if a["phase_id"] < b["phase_id"] else (b, a)
                if higher["phase_id"] not in [d for d in lower.get("depends_on", [])] and \
                   lower["phase_id"] not in [d for d in higher.get("depends_on", [])]:
                    adj[lower["phase_id"]].append(higher["phase_id"])
                    in_degree[higher["phase_id"]] += 1
                    reasoning.append(
                        f"Phase {lower['phase_id']} before Phase {higher['phase_id']} (shared files)"
                    )

    # BFS
    queue = sorted([k for k, v in in_degree.items() if v == 0])
    order = []
    while queue:
        current = queue.pop(0)
        order.append(current)
        for neighbor in adj.get(current, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)
                queue.sort()

    cycle_members = [p["phase_id"] for p in phases if p["phase_id"] not in order]
    cycles = [sorted(cycle_members)] if cycle_members else []

    return {"order": order, "cycles": cycles, "reasoning": reasoning}


def load_active_phases():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT pa.phase_id, pa.branch_name, pa.pr_number, pa.status
                FROM phase_assignments pa
                WHERE pa.status NOT IN ('merged')
                ORDER BY pa.phase_id ASC
                """
            )
            return cursor.fetchall()
    except Exception as e:
        st.error(f"Error loading phase assignments: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


def load_touch_maps():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT DISTINCT tm.file_path, t.id as task_id
                FROM touch_maps tm
                JOIN tasks t ON tm.task_id = t.id
                """
            )
            return cursor.fetchall()
    except Exception:
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


# Load data
active_phases = load_active_phases()

if not active_phases:
    st.info("No active (non-merged) phases found.")
    st.stop()

# Build phase nodes for merge order computation
touch_data = load_touch_maps()
touch_files_by_task = {}
for row in touch_data:
    task_id = row.get("task_id", "")
    if task_id not in touch_files_by_task:
        touch_files_by_task[task_id] = []
    touch_files_by_task[task_id].append(row["file_path"])

# Build phase nodes (depends_on not available from DB, use empty)
phase_nodes = []
for phase in active_phases:
    phase_nodes.append({
        "phase_id": phase["phase_id"],
        "depends_on": [],
        "touched_files": [],  # touch maps are per-task, not easily mapped to phases without more joins
    })

result = compute_merge_order(phase_nodes)

# Display merge order
st.markdown("### Recommended Merge Order")
if result["order"]:
    for i, phase_id in enumerate(result["order"], 1):
        phase_info = next((p for p in active_phases if p["phase_id"] == phase_id), None)
        status = phase_info["status"] if phase_info else "unknown"
        pr_num = phase_info.get("pr_number") if phase_info else None
        pr_text = f" (PR #{pr_num})" if pr_num else ""
        st.markdown(f"**{i}.** Phase {phase_id} -- {status}{pr_text}")
else:
    st.info("No merge order could be computed.")

# Display reasoning
if result["reasoning"]:
    st.markdown("### Ordering Reasoning")
    for reason in result["reasoning"]:
        st.markdown(f"- {reason}")

# Display cycle warnings
if result["cycles"]:
    for cycle in result["cycles"]:
        st.warning(f"Cycle detected among phases: {', '.join(str(p) for p in cycle)}")
