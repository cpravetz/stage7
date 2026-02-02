#!/usr/bin/env bash
# Quick reference commands for plugin testing

# Basic test execution
alias test-all="pytest services/capabilitiesmanager/tests/ -v"
alias test-unit="pytest services/capabilitiesmanager/tests/unit/ -m unit -v"
alias test-integration="pytest services/capabilitiesmanager/tests/integration/ -m integration -v"

# Category-specific tests
alias test-finance="pytest services/capabilitiesmanager/tests/ -m finance -v"
alias test-healthcare="pytest services/capabilitiesmanager/tests/ -m healthcare -v"
alias test-legal="pytest services/capabilitiesmanager/tests/ -m legal -v"
alias test-career="pytest services/capabilitiesmanager/tests/ -m career -v"
alias test-operations="pytest services/capabilitiesmanager/tests/ -m operations -v"
alias test-cloud="pytest services/capabilitiesmanager/tests/ -m cloud -v"
alias test-communications="pytest services/capabilitiesmanager/tests/ -m communications -v"

# Coverage and reporting
alias test-coverage="pytest services/capabilitiesmanager/tests/ --cov=services/capabilitiesmanager/src/plugins --cov-report=html --cov-report=term"
alias test-report="pytest services/capabilitiesmanager/tests/ --html=test_report.html --self-contained-html"

# Advanced options
alias test-parallel="pytest services/capabilitiesmanager/tests/ -n auto -v"
alias test-fast="pytest services/capabilitiesmanager/tests/ -x -q"
alias test-verbose="pytest services/capabilitiesmanager/tests/ -vv -s"

# Test runner script
alias test-run="python services/capabilitiesmanager/tests/test_runner.py"

# Generate fixtures
alias test-fixtures="python services/capabilitiesmanager/tests/fixtures/generator.py"

# Directory navigation
alias test-cd="cd services/capabilitiesmanager/tests"

# List all available tests
alias test-list="pytest services/capabilitiesmanager/tests/ --collect-only -q"

# Run tests and display only failures
alias test-fail="pytest services/capabilitiesmanager/tests/ -v --tb=short -q"
