#!/usr/bin/env python3
"""
Setup script for the Stage7 shared Python library.
This package contains common utilities for Python plugins including:
- plan_validator: Plan validation and repair functionality
"""

from setuptools import setup, find_packages

setup(
    name="stage7-shared-lib",
    version="1.0.0",
    description="Shared Python library for Stage7 plugins",
    author="Stage7 Team",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        # Add any dependencies here if needed
    ],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
