#!/usr/bin/env python3
"""
Test runner and CI configuration
Provides commands to run tests and generate reports
"""

import subprocess
import sys
import json
from pathlib import Path
from datetime import datetime


class TestRunner:
    """Execute tests and generate reports."""
    
    def __init__(self, test_dir: Path = None):
        """Initialize test runner."""
        self.test_dir = test_dir or Path(__file__).parent.parent
        self.results = {}
    
    def run_all_tests(self, verbose=True):
        """Run all tests and collect results."""
        cmd = ["pytest", str(self.test_dir), "-v", "--tb=short"]
        
        if not verbose:
            cmd.remove("-v")
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    
    def run_unit_tests(self):
        """Run only unit tests."""
        cmd = ["pytest", str(self.test_dir / "unit"), "-v", "-m", "unit"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    
    def run_integration_tests(self):
        """Run only integration tests."""
        cmd = ["pytest", str(self.test_dir / "integration"), "-v", "-m", "integration"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    
    def run_specific_category(self, category):
        """Run tests for specific category (finance, healthcare, legal, etc)."""
        cmd = ["pytest", str(self.test_dir), "-v", "-m", category]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    
    def run_with_coverage(self):
        """Run tests with coverage reporting."""
        cmd = [
            "pytest",
            str(self.test_dir),
            "-v",
            "--cov=src/plugins",
            "--cov-report=html",
            "--cov-report=term"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, result.stdout, result.stderr
    
    def generate_html_report(self, output_file: Path = None):
        """Generate HTML test report."""
        output_file = output_file or Path(__file__).parent.parent / "test_report.html"
        
        cmd = [
            "pytest",
            str(self.test_dir),
            "--html=" + str(output_file),
            "--self-contained-html"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, str(output_file)
    
    def generate_json_report(self, output_file: Path = None):
        """Generate JSON test report."""
        output_file = output_file or Path(__file__).parent.parent / "test_report.json"
        
        cmd = [
            "pytest",
            str(self.test_dir),
            "--json-report",
            "--json-report-file=" + str(output_file)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode, str(output_file)


def main():
    """Main test runner entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Run plugin tests")
    parser.add_argument(
        "command",
        choices=["all", "unit", "integration", "category", "coverage", "report"],
        help="Test command to run"
    )
    parser.add_argument(
        "-c", "--category",
        choices=["finance", "healthcare", "legal", "career", "operations", "cloud", "communications"],
        help="Test category (for 'category' command)"
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Verbose output"
    )
    
    args = parser.parse_args()
    
    runner = TestRunner()
    
    if args.command == "all":
        returncode, stdout, stderr = runner.run_all_tests(args.verbose)
        print(stdout)
        if stderr:
            print("STDERR:", stderr)
        sys.exit(returncode)
    
    elif args.command == "unit":
        returncode, stdout, stderr = runner.run_unit_tests()
        print(stdout)
        if stderr:
            print("STDERR:", stderr)
        sys.exit(returncode)
    
    elif args.command == "integration":
        returncode, stdout, stderr = runner.run_integration_tests()
        print(stdout)
        if stderr:
            print("STDERR:", stderr)
        sys.exit(returncode)
    
    elif args.command == "category":
        if not args.category:
            print("Error: -c/--category required for 'category' command")
            sys.exit(1)
        returncode, stdout, stderr = runner.run_specific_category(args.category)
        print(stdout)
        if stderr:
            print("STDERR:", stderr)
        sys.exit(returncode)
    
    elif args.command == "coverage":
        returncode, stdout, stderr = runner.run_with_coverage()
        print(stdout)
        if stderr:
            print("STDERR:", stderr)
        sys.exit(returncode)
    
    elif args.command == "report":
        returncode, report_file = runner.generate_html_report()
        print(f"Test report generated: {report_file}")
        sys.exit(returncode)


if __name__ == "__main__":
    main()
