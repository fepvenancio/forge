#!/usr/bin/env python3
"""
GSD Config Validation Gate — CI check that validates .planning/config.json
matches team standards.

Reads config directly from the checked-out code (no Dolt needed).
Validates required fields and enforces branching_strategy === "phase".
"""

import os
import sys
import json


def write_output(key, value):
    """Write a key=value pair to $GITHUB_OUTPUT if available."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a") as f:
            f.write(f"{key}={value}\n")


def validate_config():
    """Validate .planning/config.json against team standards."""
    config_path = ".planning/config.json"

    if not os.path.exists(config_path):
        print("WARNING: .planning/config.json not found, skipping config validation.")
        write_output("result", "skip")
        return True

    try:
        with open(config_path) as f:
            config = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: .planning/config.json is not valid JSON: {e}")
        write_output("result", "fail")
        return False

    errors = []

    # Check required top-level fields
    if not isinstance(config.get("mode"), str):
        errors.append("Missing or invalid 'mode' (expected string)")

    if not isinstance(config.get("granularity"), str):
        errors.append("Missing or invalid 'granularity' (expected string)")

    # Check workflow object
    workflow = config.get("workflow")
    if not isinstance(workflow, dict):
        errors.append("Missing or invalid 'workflow' (expected object)")
    else:
        for field in ("research", "plan_check", "verifier", "auto_advance"):
            if field not in workflow:
                errors.append(f"Missing 'workflow.{field}'")

    # Check git object and branching_strategy
    git_config = config.get("git")
    if not isinstance(git_config, dict):
        errors.append("Missing or invalid 'git' (expected object)")
    else:
        branching_strategy = git_config.get("branching_strategy")
        if branching_strategy != "phase":
            errors.append(
                f"Invalid 'git.branching_strategy': expected 'phase', "
                f"got '{branching_strategy}'"
            )

    if errors:
        print("CONFIG VALIDATION FAILED")
        print("=" * 60)
        print(f"Found {len(errors)} validation error(s) in .planning/config.json:")
        print()
        for error in errors:
            print(f"  - {error}")
        print()
        print("Ensure .planning/config.json follows the team standard configuration.")
        write_output("result", "fail")
        return False

    print("Config validation passed. All required fields present and valid.")
    write_output("result", "pass")
    return True


def main():
    print("Validating .planning/config.json...")
    if validate_config():
        sys.exit(0)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
