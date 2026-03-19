"""
Team Costs -- Cost per developer and per phase with charts and budget alerts.
"""

import streamlit as st
import pandas as pd
import pymysql
import os

st.set_page_config(page_title="Team Costs - Forge", layout="wide")
st.title("Team Costs")


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


def load_cost_summary():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT developer_id, phase_id,
                       SUM(cost_usd) as total_cost,
                       SUM(input_tokens) as total_input,
                       SUM(output_tokens) as total_output,
                       COUNT(*) as record_count
                FROM developer_costs
                GROUP BY developer_id, phase_id
                ORDER BY developer_id, phase_id
                """
            )
            return cursor.fetchall()
    except Exception as e:
        st.error(f"Error loading cost summary: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


def load_cost_by_developer():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT developer_id,
                       SUM(cost_usd) as total
                FROM developer_costs
                GROUP BY developer_id
                """
            )
            return cursor.fetchall()
    except Exception as e:
        st.error(f"Error loading developer costs: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


def load_cost_by_phase():
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                """
                SELECT phase_id,
                       SUM(cost_usd) as total
                FROM developer_costs
                GROUP BY phase_id
                """
            )
            return cursor.fetchall()
    except Exception as e:
        st.error(f"Error loading phase costs: {e}")
        return []
    finally:
        try:
            conn.close()
        except Exception:
            pass


# Load data
summary = load_cost_summary()

if not summary:
    st.info("No cost data recorded yet.")
    st.stop()

summary_df = pd.DataFrame(summary)
summary_df["total_cost"] = summary_df["total_cost"].astype(float)

# Total team cost metric
total_team_cost = summary_df["total_cost"].sum()
st.metric("Total Team Cost", f"${total_team_cost:.2f}")

# Charts side by side
col1, col2 = st.columns(2)

with col1:
    st.markdown("### Cost by Developer")
    dev_costs = load_cost_by_developer()
    if dev_costs:
        dev_df = pd.DataFrame(dev_costs)
        dev_df["total"] = dev_df["total"].astype(float)
        chart_df = dev_df.set_index("developer_id")
        st.bar_chart(chart_df["total"])

with col2:
    st.markdown("### Cost by Phase")
    phase_costs = load_cost_by_phase()
    if phase_costs:
        phase_df = pd.DataFrame(phase_costs)
        phase_df["total"] = phase_df["total"].astype(float)
        phase_df["phase_id"] = phase_df["phase_id"].astype(str)
        chart_df = phase_df.set_index("phase_id")
        st.bar_chart(chart_df["total"])

# Budget alerts
budget_str = os.environ.get("FORGE_PHASE_BUDGET_USD")
if budget_str and phase_costs:
    budget = float(budget_str)
    for row in phase_costs:
        phase_total = float(row["total"])
        if phase_total > budget:
            st.warning(
                f"Phase {row['phase_id']} exceeds budget: ${phase_total:.2f} > ${budget:.2f}"
            )

# Detailed summary table
st.markdown("### Detailed Cost Summary")
display_df = summary_df.rename(columns={
    "developer_id": "Developer",
    "phase_id": "Phase",
    "total_cost": "Total Cost ($)",
    "total_input": "Input Tokens",
    "total_output": "Output Tokens",
    "record_count": "Records",
})

st.dataframe(
    display_df[["Developer", "Phase", "Total Cost ($)", "Input Tokens", "Output Tokens", "Records"]],
    use_container_width=True,
    hide_index=True,
)
