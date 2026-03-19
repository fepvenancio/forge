"""
PR Status -- Shows PR status for all phase branches with links.
"""

import streamlit as st
import pandas as pd
import pymysql
import os

st.set_page_config(page_title="PR Status - Forge", layout="wide")
st.title("PR Status")


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


def load_pr_data():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT pa.phase_id, pa.assignee, d.display_name,
                       pa.status, pa.branch_name, pa.pr_number
                FROM phase_assignments pa
                LEFT JOIN developers d ON pa.assignee = d.id
                WHERE pa.pr_number IS NOT NULL
                ORDER BY pa.pr_number DESC
                """
            )
            return cursor.fetchall()
    except Exception as e:
        st.error(f"Error loading PR data: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


# Load data
prs = load_pr_data()

if not prs:
    st.info("No open PRs found.")
    st.stop()

df = pd.DataFrame(prs)

# Rename columns for display
display_df = df.rename(columns={
    "pr_number": "PR#",
    "phase_id": "Phase",
    "display_name": "Developer",
    "status": "Status",
    "branch_name": "Branch",
})

st.dataframe(
    display_df[["PR#", "Phase", "Developer", "Status", "Branch"]],
    use_container_width=True,
    hide_index=True,
)
