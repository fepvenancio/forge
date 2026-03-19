"""
Forge Dashboard — Main Entry Point

Streamlit-based dashboard for monitoring Forge cycles, tasks, and costs.
Reads from Dolt via MySQL connection.
"""

import streamlit as st

st.set_page_config(
    page_title="Forge Dashboard",
    page_icon="🔨",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.title("Forge Dashboard")
st.markdown("*Team Coordination Layer*")

# Sidebar navigation
st.sidebar.title("Navigation")
st.sidebar.markdown("---")

st.markdown("""
## Welcome to Forge

Use the sidebar to navigate between views:

### Team Coordination (v2)

- **Phase Map** -- Phase ownership: who's working on what, with status
- **PR Status** -- PR status for all phase branches
- **Merge Order** -- Recommended merge order using dependency analysis
- **File Locks** -- Advisory file lock map showing locked files
- **Team Costs** -- Cost per developer and per phase with budget alerts

### Legacy Views (v0.1.0)

- **Task Board** -- Live table of all tasks with status, filtering, and actions
- **Audit Trail** -- Timeline view of stage runs and artifacts for each cycle
- **Cost Tracker** -- Cost per cycle charts and breakdowns

### Quick Start

1. Ensure Dolt is running (`scripts/init-dolt.sh`)
2. Register: `forge register`
3. Claim a phase: `forge claim <N>`
4. Monitor progress here

### Connection Status
""")

# Check Dolt connection
import pymysql
import os

try:
    conn = pymysql.connect(
        host=os.environ.get("DOLT_HOST", "localhost"),
        port=int(os.environ.get("DOLT_PORT", "3306")),
        user=os.environ.get("DOLT_USER", "root"),
        password=os.environ.get("DOLT_PASSWORD", ""),
        database=os.environ.get("DOLT_DATABASE", "forge"),
    )
    conn.close()
    st.success("Connected to Dolt")
except Exception as e:
    st.error(f"Cannot connect to Dolt: {e}")
    st.info("Start Dolt with: `scripts/init-dolt.sh`")
