"""
Phase Map -- Phase ownership view showing developer assignments and status.
"""

import streamlit as st
import pandas as pd
import pymysql
import os
from datetime import datetime

st.set_page_config(page_title="Phase Map - Forge", layout="wide")
st.title("Phase Map")


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


def load_phase_assignments():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT pa.phase_id, pa.assignee, d.display_name,
                       pa.status, pa.branch_name, pa.pr_number, pa.assigned_at
                FROM phase_assignments pa
                LEFT JOIN developers d ON pa.assignee = d.id
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


# Load data
assignments = load_phase_assignments()

if not assignments:
    st.info("No phase assignments found. Use `forge claim <phase>` to assign phases.")
    st.stop()

df = pd.DataFrame(assignments)

# Metric cards
col1, col2, col3, col4 = st.columns(4)
with col1:
    st.metric("Total Phases", len(df))
with col2:
    st.metric("Active", len(df[df["status"] == "in_progress"]))
with col3:
    st.metric("PRs Open", len(df[df["status"] == "pr_open"]))
with col4:
    st.metric("Merged", len(df[df["status"] == "merged"]))

# Format timestamps
if "assigned_at" in df.columns:
    df["assigned_at"] = df["assigned_at"].apply(
        lambda x: datetime.fromtimestamp(x / 1000).strftime("%Y-%m-%d %H:%M") if x else ""
    )

# Rename columns for display
display_df = df.rename(columns={
    "phase_id": "Phase",
    "display_name": "Developer",
    "status": "Status",
    "branch_name": "Branch",
    "pr_number": "PR#",
    "assigned_at": "Assigned",
})

st.dataframe(
    display_df[["Phase", "Developer", "Status", "Branch", "PR#", "Assigned"]],
    use_container_width=True,
    hide_index=True,
)
