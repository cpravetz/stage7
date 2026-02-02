#!/usr/bin/env python3
"""
Test Suite Index and Discovery
Provides quick access to all test files and categories
"""

import json
from pathlib import Path
from datetime import datetime


class TestIndex:
    """Index of all tests in the suite."""
    
    @staticmethod
    def get_test_files():
        """Get list of all test files."""
        return {
            "Unit Tests": [
                {
                    "file": "test_financial_analysis.py",
                    "category": "finance",
                    "tests": 15,
                    "modules": ["Portfolio", "Risk Assessment", "Calculations"],
                    "line_count": 400
                },
                {
                    "file": "test_medical_records.py",
                    "category": "healthcare",
                    "tests": 18,
                    "modules": ["Patient Records", "HIPAA", "Medications", "RBAC"],
                    "line_count": 400
                },
                {
                    "file": "test_database.py",
                    "category": "database",
                    "tests": 20,
                    "modules": ["CRUD", "Transactions", "Pooling", "Backup"],
                    "line_count": 350
                },
                {
                    "file": "test_contract_analysis.py",
                    "category": "legal",
                    "tests": 18,
                    "modules": ["Parsing", "Clauses", "Risk Detection", "Red Flags"],
                    "line_count": 400
                },
                {
                    "file": "test_resume_optimizer.py",
                    "category": "career",
                    "tests": 14,
                    "modules": ["ATS", "Keywords", "Optimization"],
                    "line_count": 300
                },
                {
                    "file": "test_hotel_reservation.py",
                    "category": "operations",
                    "tests": 16,
                    "modules": ["Reservations", "Availability", "Rates"],
                    "line_count": 350
                },
                {
                    "file": "test_restaurant_reservation.py",
                    "category": "operations",
                    "tests": 16,
                    "modules": ["Tables", "Orders", "Servers"],
                    "line_count": 350
                },
                {
                    "file": "test_cloud_integrations.py",
                    "category": "cloud",
                    "tests": 25,
                    "modules": ["AWS", "GCP", "Azure", "Datadog", "PagerDuty"],
                    "line_count": 450
                },
                {
                    "file": "test_communications.py",
                    "category": "communications",
                    "tests": 16,
                    "modules": ["Email", "Calendar", "Messaging"],
                    "line_count": 350
                },
                {
                    "file": "test_utilities_and_tools.py",
                    "category": "utilities",
                    "tests": 20,
                    "modules": ["Files", "Code", "Knowledge Base"],
                    "line_count": 400
                },
                {
                    "file": "test_analytics_and_business.py",
                    "category": "analytics",
                    "tests": 25,
                    "modules": ["Analytics", "CRM", "Reporting", "Skills"],
                    "line_count": 500
                }
            ],
            "Integration Tests": [
                {
                    "file": "test_plugin_integration.py",
                    "category": "integration",
                    "tests": 30,
                    "modules": ["Database", "Finance", "Healthcare", "Cloud", "Data Flows"],
                    "line_count": 400
                }
            ]
        }
    
    @staticmethod
    def get_fixtures():
        """Get list of all fixtures."""
        return {
            "Global Fixtures (conftest.py)": [
                "mock_logger",
                "sample_inputs",
                "mock_yfinance",
                "mock_pandas",
                "mock_numpy",
                "mock_requests",
                "mock_cryptography",
                "mock_database",
                "sample_ticker_data",
                "sample_patient_data",
                "sample_legal_document",
                "sample_resume",
                "sample_hotel_reservation",
                "sample_restaurant_order"
            ],
            "Test Data Generators": [
                "TestDataGenerator.generate_financial_data()",
                "TestDataGenerator.generate_patient_records()",
                "TestDataGenerator.generate_contracts()",
                "TestDataGenerator.generate_hotel_reservations()",
                "TestDataGenerator.generate_restaurant_orders()"
            ]
        }
    
    @staticmethod
    def get_test_markers():
        """Get available test markers."""
        return {
            "Test Type": {
                "unit": "Unit tests",
                "integration": "Integration tests",
                "slow": "Long-running tests"
            },
            "Categories": {
                "finance": "Finance plugin tests",
                "healthcare": "Healthcare plugin tests",
                "legal": "Legal plugin tests",
                "career": "Career plugin tests",
                "operations": "Operations plugin tests",
                "cloud": "Cloud integration tests",
                "communications": "Communication tests"
            }
        }
    
    @staticmethod
    def get_commands():
        """Get useful commands."""
        return {
            "Run All Tests": "pytest tests/ -v",
            "Run Unit Tests": "pytest tests/unit/ -m unit -v",
            "Run Integration Tests": "pytest tests/integration/ -m integration -v",
            "Run by Category": {
                "Finance": "pytest tests/ -m finance -v",
                "Healthcare": "pytest tests/ -m healthcare -v",
                "Legal": "pytest tests/ -m legal -v",
                "Career": "pytest tests/ -m career -v",
                "Operations": "pytest tests/ -m operations -v",
                "Cloud": "pytest tests/ -m cloud -v",
                "Communications": "pytest tests/ -m communications -v"
            },
            "Coverage": "pytest tests/ --cov=src/plugins --cov-report=html",
            "Reports": "pytest tests/ --html=report.html --self-contained-html",
            "Using Test Runner": {
                "All": "python test_runner.py all",
                "Unit": "python test_runner.py unit",
                "Integration": "python test_runner.py integration",
                "Category": "python test_runner.py category -c finance",
                "Coverage": "python test_runner.py coverage",
                "Report": "python test_runner.py report"
            },
            "Advanced": {
                "Parallel": "pytest tests/ -n auto",
                "Fast": "pytest tests/ -x -q",
                "Verbose": "pytest tests/ -vv -s",
                "Specific Test": "pytest tests/ -k test_name"
            }
        }
    
    @staticmethod
    def print_summary():
        """Print test summary."""
        index = TestIndex()
        files = index.get_test_files()
        fixtures = index.get_fixtures()
        markers = index.get_test_markers()
        
        print("=" * 80)
        print("CAPABILITIES MANAGER TEST SUITE SUMMARY")
        print("=" * 80)
        print()
        
        # Test Files Summary
        print("TEST FILES")
        print("-" * 80)
        total_tests = 0
        total_lines = 0
        
        for section, test_list in files.items():
            print(f"\n{section}:")
            for test in test_list:
                total_tests += test["tests"]
                total_lines += test["line_count"]
                print(f"  {test['file']:30} {test['tests']:3} tests  {test['line_count']:4} lines  {test['category']}")
        
        print()
        print(f"Total: {total_tests} tests, {total_lines:,} lines of test code")
        print()
        
        # Fixtures Summary
        print("FIXTURES")
        print("-" * 80)
        for section, fixture_list in fixtures.items():
            print(f"\n{section}:")
            for fixture in fixture_list:
                print(f"  - {fixture}")
        
        print()
        
        # Markers Summary
        print("TEST MARKERS")
        print("-" * 80)
        for category, markers_dict in markers.items():
            print(f"\n{category}:")
            for marker, description in markers_dict.items():
                print(f"  pytest -m {marker:15} - {description}")
        
        print()
        print("=" * 80)
        print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 80)
    
    @staticmethod
    def export_json(output_file="test_index.json"):
        """Export test index to JSON."""
        index = TestIndex()
        data = {
            "generated": datetime.now().isoformat(),
            "test_files": index.get_test_files(),
            "fixtures": index.get_fixtures(),
            "markers": index.get_test_markers(),
            "commands": index.get_commands()
        }
        
        with open(output_file, "w") as f:
            json.dump(data, f, indent=2)
        
        print(f"Test index exported to {output_file}")


if __name__ == "__main__":
    TestIndex.print_summary()
    TestIndex.export_json()
