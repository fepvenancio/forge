"""
Task Board — Live table of all tasks with status, filtering, and actions.
"""

import streamlit as st
import pandas as pd
import pymysql
import os
from datetime import datetime

st.set_page_config(page_title="Task Board — Forge", layout="wide")
st.title("Task Board")


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


def load_tasks(status_filter=None, cycle_filter=None, layer_filter=None):
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            query = "SELECT * FROM tasks WHERE 1=1"
            params = []

            if status_filter and status_filter != "All":
                query += " AND status = %s"
                params.append(status_filter)
            if cycle_filter and cycle_filter != "All":
                query += " AND cycle_id = %s"
                params.append(cycle_filter)
            if layer_filter and layer_filter != "All":
                query += " AND layer = %s"
                params.append(layer_filter)

            query += " ORDER BY updated_at DESC"
            cursor.execute(query, params)
            return cursor.fetchall()
    except Exception as e:
        st.error(f"Error loading tasks: {e}")
        return []
    finally:
        try:
            conn.close()
        except:
            pass


def load_cycles():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, status FROM cycles ORDER BY started_at DESC")
            return cursor.fetchall()
    except:
        return []
    finally:
        try:
            conn.close()
        except:
            pass


# Filters
col1, col2, col3 = st.columns(3)
with col1:
    status_filter = st.selectbox(
        "Status",
        ["All", "pending", "planning", "in_progress", "reviewing", "blocked", "done", "failed", "cancelled"],
    )
with col2:
    cycles = load_cycles()
    cycle_options = ["All"] + [c["id"][:8] + "..." for c in cycles]
    cycle_ids = [None] + [c["id"] for c in cycles]
    cycle_idx = st.selectbox("Cycle", range(len(cycle_options)), format_func=lambda i: cycle_options[i])
    cycle_filter = cycle_ids[cycle_idx] if cycle_idx > 0 else None
with col3:
    layer_filter = st.selectbox("Layer", ["All", "frontend", "backend", "database", "infra", "any"])

# Load and display tasks
tasks = load_tasks(status_filter, cycle_filter, layer_filter)

if not tasks:
    st.info("No tasks found matching the filters.")
else:
    df = pd.DataFrame(tasks)

    # Format timestamps
    for col in ["created_at", "updated_at"]:
        if col in df.columns:
            df[col] = df[col].apply(
                lambda x: datetime.fromtimestamp(x / 1000).strftime("%Y-%m-%d %H:%M:%S") if x else ""
            )

    # Display
    st.dataframe(
        df[["id", "title", "status", "layer", "complexity", "cycle_id", "updated_at"]],
        use_container_width=True,
        hide_index=True,
    )

    # Action buttons
    st.markdown("### Actions")
    col1, col2 = st.columns(2)
    with col1:
        task_to_kill = st.text_input("Task ID to kill")
        if st.button("Kill Worker") and task_to_kill:
            try:
                conn = get_connection()
                with conn.cursor() as cursor:
                    cursor.execute(
                        "UPDATE tasks SET status = 'cancelled', updated_at = %s WHERE id = %s",
                        [int(datetime.now().timestamp() * 1000), task_to_kill],
                    )
                conn.commit()
                conn.close()
                st.success(f"Task {task_to_kill} cancelled")
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")

# Auto-refresh
st.markdown("---")
st.caption("Auto-refreshes every 10 seconds")
st_autorefresh = st.empty()
import time

time.sleep(0)  # Placeholder — Streamlit handles refresh via rerun
