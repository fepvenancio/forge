"""
File Locks -- Advisory file lock map showing which files are locked by whom.
"""

import streamlit as st
import pandas as pd
import pymysql
import os
from datetime import datetime

st.set_page_config(page_title="File Locks - Forge", layout="wide")
st.title("File Locks")


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


def load_file_locks():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT fl.file_path, fl.locked_by, d.display_name,
                       fl.phase_id, fl.locked_at, fl.reason
                FROM file_locks fl
                LEFT JOIN developers d ON fl.locked_by = d.id
                ORDER BY fl.locked_at DESC
                """
            )
            return cursor.fetchall()
    except Exception as e:
        st.error(f"Error loading file locks: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


# Load data
locks = load_file_locks()

# Metric
st.metric("Active Locks", len(locks))

if not locks:
    st.info("No active file locks.")
    st.stop()

df = pd.DataFrame(locks)

# Format timestamps
if "locked_at" in df.columns:
    df["locked_at"] = df["locked_at"].apply(
        lambda x: datetime.fromtimestamp(x / 1000).strftime("%Y-%m-%d %H:%M") if x else ""
    )

# Rename columns for display
display_df = df.rename(columns={
    "file_path": "File",
    "display_name": "Locked By",
    "phase_id": "Phase",
    "locked_at": "Locked At",
    "reason": "Reason",
})

st.dataframe(
    display_df[["File", "Locked By", "Phase", "Locked At", "Reason"]],
    use_container_width=True,
    hide_index=True,
)
