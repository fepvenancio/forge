"""
Cost Tracker — Cost per cycle charts and breakdowns.
"""

import streamlit as st
import pandas as pd
import pymysql
import os
from datetime import datetime

st.set_page_config(page_title="Cost Tracker — Forge", layout="wide")
st.title("Cost Tracker")


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


def load_cycle_costs():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT cc.cycle_id, SUM(cc.cost_usd) as total_cost,
                       SUM(cc.input_tokens) as total_input,
                       SUM(cc.output_tokens) as total_output,
                       MIN(cc.recorded_at) as first_recorded
                FROM cycle_costs cc
                GROUP BY cc.cycle_id
                ORDER BY first_recorded DESC
                LIMIT 20
                """
            )
            return cursor.fetchall()
    except:
        return []
    finally:
        try:
            conn.close()
        except:
            pass


def load_cost_breakdown(cycle_id):
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT * FROM cycle_costs WHERE cycle_id = %s ORDER BY recorded_at ASC",
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


# Cost per cycle bar chart
cycle_costs = load_cycle_costs()

if not cycle_costs:
    st.info("No cost data found. Run a cycle first.")
    st.stop()

# Check max cost config
max_cost = float(os.environ.get("FORGE_MAX_CYCLE_COST_USD", "50"))

df = pd.DataFrame(cycle_costs)
df["cycle_short"] = df["cycle_id"].str[:8] + "..."
df["total_cost"] = df["total_cost"].astype(float)

# Bar chart
st.markdown("### Cost per Cycle (Last 20)")
chart_data = df[["cycle_short", "total_cost"]].set_index("cycle_short")
st.bar_chart(chart_data)

# Warning banner
over_cap = df[df["total_cost"] > max_cost]
if not over_cap.empty:
    st.warning(
        f"⚠️ {len(over_cap)} cycle(s) exceeded the cost cap of ${max_cost:.2f}"
    )

# Breakdown for selected cycle
st.markdown("### Cost Breakdown")
cycle_options = [f"{row['cycle_short']} — ${row['total_cost']:.4f}" for _, row in df.iterrows()]
cycle_ids = df["cycle_id"].tolist()
selected_idx = st.selectbox("Select Cycle", range(len(cycle_options)), format_func=lambda i: cycle_options[i])
selected_cycle_id = cycle_ids[selected_idx]

breakdown = load_cost_breakdown(selected_cycle_id)
if breakdown:
    bdf = pd.DataFrame(breakdown)
    bdf["cost_usd"] = bdf["cost_usd"].astype(float)

    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric("Total Cost", f"${bdf['cost_usd'].sum():.4f}")
    with col2:
        st.metric("Input Tokens", f"{bdf['input_tokens'].sum():,}")
    with col3:
        st.metric("Output Tokens", f"{bdf['output_tokens'].sum():,}")

    st.dataframe(
        bdf[["stage", "model", "input_tokens", "output_tokens", "cost_usd"]],
        use_container_width=True,
        hide_index=True,
    )

    # Cost by role pie chart
    role_costs = bdf.groupby("stage")["cost_usd"].sum()
    st.markdown("#### Cost by Role")
    st.bar_chart(role_costs)
else:
    st.info("No breakdown data found for this cycle.")
