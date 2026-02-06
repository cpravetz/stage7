#!/usr/bin/env python3
"""
GITHUB Plugin - Repository and Version Control Management
Provides GitHub integration for repositories, issues, PRs, build status, and code quality.
"""

import sys
import json
import logging
import os
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
import uuid
import random

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Simulated GitHub data structures
REPOS = {
    "repo-001": {
        "id": "repo-001",
        "name": "cktMCS",
        "owner": "ckt-team",
        "url": "https://github.com/ckt-team/cktMCS",
        "description": "Advanced Multi-Capability System",
        "language": "TypeScript",
        "stars": 324,
        "forks": 45,
        "open_issues": 12,
        "created_at": (datetime.now() - timedelta(days=720)).isoformat(),
        "updated_at": datetime.now().isoformat(),
        "default_branch": "main"
    },
    "repo-002": {
        "id": "repo-002",
        "name": "agents-framework",
        "owner": "ckt-team",
        "url": "https://github.com/ckt-team/agents-framework",
        "description": "Multi-agent framework for AI assistants",
        "language": "Python",
        "stars": 256,
        "forks": 38,
        "open_issues": 8,
        "created_at": (datetime.now() - timedelta(days=550)).isoformat(),
        "updated_at": datetime.now().isoformat(),
        "default_branch": "main"
    }
}

ISSUES = {
    "issue-001": {
        "id": "issue-001",
        "repo_id": "repo-001",
        "number": 1,
        "title": "Add authentication layer",
        "state": "open",
        "priority": "high",
        "assignee": "john.doe",
        "created_at": (datetime.now() - timedelta(days=15)).isoformat(),
        "updated_at": datetime.now().isoformat(),
        "labels": ["feature", "security"]
    },
    "issue-002": {
        "id": "issue-002",
        "repo_id": "repo-001",
        "number": 2,
        "title": "Fix memory leak in data processor",
        "state": "open",
        "priority": "critical",
        "assignee": "jane.smith",
        "created_at": (datetime.now() - timedelta(days=5)).isoformat(),
        "updated_at": datetime.now().isoformat(),
        "labels": ["bug", "performance"]
    }
}

PULL_REQUESTS = {
    "pr-001": {
        "id": "pr-001",
        "repo_id": "repo-001",
        "number": 42,
        "title": "Refactor database connection pool",
        "state": "open",
        "author": "alice.johnson",
        "created_at": (datetime.now() - timedelta(days=3)).isoformat(),
        "updated_at": datetime.now().isoformat(),
        "additions": 245,
        "deletions": 128,
        "changed_files": 5,
        "review_status": "pending"
    },
    "pr-002": {
        "id": "pr-002",
        "repo_id": "repo-001",
        "number": 41,
        "title": "Update dependencies",
        "state": "merged",
        "author": "bob.wilson",
        "created_at": (datetime.now() - timedelta(days=7)).isoformat(),
        "updated_at": (datetime.now() - timedelta(days=1)).isoformat(),
        "additions": 89,
        "deletions": 34,
        "changed_files": 3,
        "review_status": "approved"
    }
}

COMMITS = [
    {
        "hash": "a1b2c3d4e5f6g7h8i9j0",
        "repo_id": "repo-001",
        "message": "Implement cloud monitoring integration",
        "author": "john.doe",
        "timestamp": (datetime.now() - timedelta(hours=2)).isoformat(),
        "lines_added": 456,
        "lines_deleted": 89
    },
    {
        "hash": "b2c3d4e5f6g7h8i9j0k1",
        "repo_id": "repo-001",
        "message": "Fix API response parsing",
        "author": "jane.smith",
        "timestamp": (datetime.now() - timedelta(hours=6)).isoformat(),
        "lines_added": 34,
        "lines_deleted": 12
    },
    {
        "hash": "c3d4e5f6g7h8i9j0k1l2",
        "repo_id": "repo-001",
        "message": "Update test coverage to 85%",
        "author": "alice.johnson",
        "timestamp": (datetime.now() - timedelta(hours=18)).isoformat(),
        "lines_added": 234,
        "lines_deleted": 56
    }
]

BUILD_RUNS = {
    "build-001": {
        "id": "build-001",
        "repo_id": "repo-001",
        "branch": "main",
        "status": "success",
        "duration_seconds": 345,
        "timestamp": (datetime.now() - timedelta(hours=1)).isoformat(),
        "commit": "a1b2c3d4e5f6g7h8i9j0"
    },
    "build-002": {
        "id": "build-002",
        "repo_id": "repo-001",
        "branch": "feature/auth",
        "status": "failure",
        "duration_seconds": 280,
        "timestamp": (datetime.now() - timedelta(hours=3)).isoformat(),
        "commit": "b2c3d4e5f6g7h8i9j0k1",
        "error": "Test suite failed: 5 failures"
    }
}

CODE_QUALITY = {
    "repo-001": {
        "repo_id": "repo-001",
        "code_coverage": 82.3,
        "complexity_score": 7.2,
        "maintainability_index": 78.5,
        "issues_found": 23,
        "critical": 2,
        "major": 8,
        "minor": 13,
        "last_scan": datetime.now().isoformat()
    }
}

def _get_input(inputs: dict, key: str, aliases: list = [], default=None):
    """Safely gets a value from inputs."""
    raw_val = inputs.get(key)
    if raw_val is None:
        for alias in aliases:
            raw_val = inputs.get(alias)
            if raw_val is not None:
                break
    if raw_val is None:
        return default
    if isinstance(raw_val, dict) and 'value' in raw_val:
        return raw_val['value'] if raw_val['value'] is not None else default
    return raw_val if raw_val is not None else default

def _validate_string(value: str, min_length: int = 1) -> bool:
    """Validate string parameter."""
    return isinstance(value, str) and len(value) >= min_length

def _get_repos(payload: dict) -> Dict[str, Any]:
    """Get list of repositories."""
    try:
        owner_filter = payload.get("owner", "")
        language_filter = payload.get("language", "")
        
        repos = list(REPOS.values())
        
        if owner_filter:
            repos = [r for r in repos if r["owner"] == owner_filter]
        
        if language_filter:
            repos = [r for r in repos if r["language"] == language_filter]
        
        return {
            "success": True,
            "total_repos": len(repos),
            "repositories": repos
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _create_issue(payload: dict) -> Dict[str, Any]:
    """Create a new GitHub issue."""
    try:
        repo_id = payload.get("repo_id", "")
        title = payload.get("title", "")
        description = payload.get("description", "")
        priority = payload.get("priority", "medium")
        labels = payload.get("labels", [])
        
        if not _validate_string(repo_id):
            return {"success": False, "error": "repo_id is required"}
        
        if not _validate_string(title, 5):
            return {"success": False, "error": "Title must be at least 5 characters"}
        
        if repo_id not in REPOS:
            return {"success": False, "error": f"Repository {repo_id} not found"}
        
        issue_id = f"issue-{uuid.uuid4().hex[:8]}"
        next_number = max([i["number"] for i in ISSUES.values()], default=0) + 1
        
        issue = {
            "id": issue_id,
            "repo_id": repo_id,
            "number": next_number,
            "title": title,
            "description": description,
            "state": "open",
            "priority": priority,
            "labels": labels if isinstance(labels, list) else [],
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat()
        }
        
        ISSUES[issue_id] = issue
        
        return {
            "success": True,
            "issue_id": issue_id,
            "issue_number": next_number,
            "title": title,
            "message": "Issue created successfully"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _list_prs(payload: dict) -> Dict[str, Any]:
    """List pull requests for a repository."""
    try:
        repo_id = payload.get("repo_id", "")
        state_filter = payload.get("state", "")
        
        if not _validate_string(repo_id):
            return {"success": False, "error": "repo_id is required"}
        
        prs = [pr for pr in PULL_REQUESTS.values() if pr["repo_id"] == repo_id]
        
        if state_filter:
            prs = [pr for pr in prs if pr["state"] == state_filter]
        
        open_count = len([pr for pr in prs if pr["state"] == "open"])
        merged_count = len([pr for pr in prs if pr["state"] == "merged"])
        
        return {
            "success": True,
            "repo_id": repo_id,
            "total_prs": len(prs),
            "open": open_count,
            "merged": merged_count,
            "pull_requests": prs
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _check_build_status(payload: dict) -> Dict[str, Any]:
    """Check build status for repository."""
    try:
        repo_id = payload.get("repo_id", "")
        branch = payload.get("branch", "main")
        
        if not _validate_string(repo_id):
            return {"success": False, "error": "repo_id is required"}
        
        builds = [b for b in BUILD_RUNS.values() 
                 if b["repo_id"] == repo_id and b["branch"] == branch]
        
        if not builds:
            return {
                "success": True,
                "repo_id": repo_id,
                "branch": branch,
                "status": "no_builds",
                "message": "No build history found"
            }
        
        latest_build = max(builds, key=lambda x: x["timestamp"])
        
        success_count = len([b for b in builds if b["status"] == "success"])
        failure_count = len([b for b in builds if b["status"] == "failure"])
        
        return {
            "success": True,
            "repo_id": repo_id,
            "branch": branch,
            "latest_build": latest_build,
            "total_builds": len(builds),
            "success_count": success_count,
            "failure_count": failure_count,
            "success_rate": round((success_count / len(builds)) * 100, 1) if builds else 0
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _get_commits(payload: dict) -> Dict[str, Any]:
    """Get recent commits for repository."""
    try:
        repo_id = payload.get("repo_id", "")
        limit = payload.get("limit", 10)
        
        if not _validate_string(repo_id):
            return {"success": False, "error": "repo_id is required"}
        
        if not isinstance(limit, int) or limit < 1:
            limit = 10
        
        commits = [c for c in COMMITS if c["repo_id"] == repo_id]
        commits = sorted(commits, key=lambda x: x["timestamp"], reverse=True)[:limit]
        
        total_additions = sum(c.get("lines_added", 0) for c in commits)
        total_deletions = sum(c.get("lines_deleted", 0) for c in commits)
        
        return {
            "success": True,
            "repo_id": repo_id,
            "total_commits": len(commits),
            "commits": commits,
            "stats": {
                "total_additions": total_additions,
                "total_deletions": total_deletions,
                "net_change": total_additions - total_deletions
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def _analyze_code_quality(payload: dict) -> Dict[str, Any]:
    """Analyze code quality metrics for repository."""
    try:
        repo_id = payload.get("repo_id", "")
        
        if not _validate_string(repo_id):
            return {"success": False, "error": "repo_id is required"}
        
        if repo_id not in CODE_QUALITY:
            return {"success": False, "error": f"No quality data for repository {repo_id}"}
        
        quality = CODE_QUALITY[repo_id]
        
        # Determine overall grade
        coverage = quality["code_coverage"]
        if coverage >= 85:
            grade = "A"
        elif coverage >= 70:
            grade = "B"
        elif coverage >= 50:
            grade = "C"
        else:
            grade = "D"
        
        # Calculate health score
        health_score = (
            (coverage / 100) * 40 +
            (10 - min(quality["complexity_score"], 10)) / 10 * 30 +
            (quality["maintainability_index"] / 100) * 30
        )
        
        return {
            "success": True,
            "repo_id": repo_id,
            "code_coverage": quality["code_coverage"],
            "grade": grade,
            "complexity_score": quality["complexity_score"],
            "maintainability_index": quality["maintainability_index"],
            "issues": {
                "total": quality["issues_found"],
                "critical": quality["critical"],
                "major": quality["major"],
                "minor": quality["minor"]
            },
            "health_score": round(health_score, 1),
            "last_scan": quality["last_scan"]
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def execute_plugin(inputs: dict) -> Dict[str, Any]:
    """Main plugin execution function."""
    try:
        action = _get_input(inputs, "action", ["operation", "command"])
        payload = _get_input(inputs, "payload", ["data", "params", "parameters"], {})
        
        if not action:
            return {
                "success": False,
                "error": "action is required",
                "available_actions": [
                    "get_repos",
                    "create_issue",
                    "list_prs",
                    "check_build_status",
                    "get_commits",
                    "analyze_code_quality"
                ]
            }
        
        if action == "get_repos":
            return _get_repos(payload)
        elif action == "create_issue":
            return _create_issue(payload)
        elif action == "list_prs":
            return _list_prs(payload)
        elif action == "check_build_status":
            return _check_build_status(payload)
        elif action == "get_commits":
            return _get_commits(payload)
        elif action == "analyze_code_quality":
            return _analyze_code_quality(payload)
        else:
            return {
                "success": False,
                "error": f"Unknown action: {action}",
                "available_actions": [
                    "get_repos",
                    "create_issue",
                    "list_prs",
                    "check_build_status",
                    "get_commits",
                    "analyze_code_quality"
                ]
            }
    
    except Exception as e:
        logger.error(f"Plugin error: {str(e)}")
        return {"success": False, "error": f"Plugin execution error: {str(e)}"}

if __name__ == "__main__":
    try:
        inputs = json.loads(sys.stdin.read())
        result = execute_plugin(inputs)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
