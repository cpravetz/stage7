#!/usr/bin/env python3
"""
TASK_MANAGER Plugin for Stage7

This plugin allows agents to create, manage, and track tasks and subtasks.
It provides functionality for task creation, status updates, and task retrieval.
"""

import sys
import json
import os
import requests
from typing import Dict, List, Any, Optional
import uuid
import time
import random
import string


class InputValue:
    """Represents a plugin input parameter in the new format"""
    def __init__(self, inputName: str, value: Any, valueType: str, args: Dict[str, Any] = None):
        self.inputName = inputName
        self.value = value
        self.valueType = valueType
        self.args = args or {}


class PluginOutput:
    """Represents a plugin output result"""
    def __init__(self, success: bool, name: str, result_type: str, 
                 result: Any, result_description: str, error: str = None):
        self.success = success
        self.name = name
        self.result_type = result_type
        self.result = result
        self.result_description = result_description
        self.error = error
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        output = {
            "success": self.success,
            "name": self.name,
            "resultType": self.result_type,
            "result": self.result,
            "resultDescription": self.result_description
        }
        if self.error:
            output["error"] = self.error
        return output


class LibrarianClient:
    """Client for interacting with the Librarian service"""
    
    def __init__(self, base_url: str = None):
        self.base_url = base_url or os.getenv('LIBRARIAN_URL', 'http://librarian:5040')
        self.task_manager_key = 'task-manager-tasks'
    
    def get_task_list(self) -> Dict[str, Any]:
        """Retrieve the task list from Librarian"""
        try:
            response = requests.get(f"{self.base_url}/data/{self.task_manager_key}")
            if response.status_code == 404:
                return {"tasks": []}
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            if hasattr(e, 'response') and e.response.status_code == 404:
                return {"tasks": []}
            raise e
    
    def save_task_list(self, data: Dict[str, Any]) -> None:
        """Save the task list to Librarian"""
        payload = {
            "key": self.task_manager_key,
            "value": data
        }
        response = requests.post(f"{self.base_url}/data", json=payload)
        response.raise_for_status()


def generate_id(prefix: str) -> str:
    """Generate a unique ID with the given prefix"""
    timestamp = int(time.time() * 1000)
    random_suffix = ''.join(random.choices(string.ascii_lowercase + string.digits, k=7))
    return f"{prefix}_{timestamp}_{random_suffix}"


def execute_task_manager(inputs: List[List[Any]]) -> List[Dict[str, Any]]:
    """Main execution function for the TASK_MANAGER plugin"""
    try:
        # Parse inputs
        inputs_dict = {item[0]: item[1] for item in inputs}
        
        # Extract command and goal
        command_input = inputs_dict.get('command', {})
        command = command_input.get('value', '') if isinstance(command_input, dict) else str(command_input)
        
        goal_input = inputs_dict.get('goal', {})
        goal = goal_input.get('value', '') if isinstance(goal_input, dict) else str(goal_input)
        
        if not command:
            command = 'create_task'  # Default command
        
        if not goal:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="error",
                result="Goal is required for task management operations",
                result_description="Missing required goal parameter"
            ).to_dict()]
        
        # Initialize Librarian client
        librarian = LibrarianClient()
        
        # Execute the appropriate command
        if command == 'create_task':
            return create_task(librarian, goal)
        elif command == 'create_subtask':
            parent_task_id_input = inputs_dict.get('parent_task_id', {})
            parent_task_id = parent_task_id_input.get('value', '') if isinstance(parent_task_id_input, dict) else str(parent_task_id_input)
            return create_subtask(librarian, parent_task_id, goal)
        elif command == 'update_task_status':
            task_id_input = inputs_dict.get('task_id', {})
            task_id = task_id_input.get('value', '') if isinstance(task_id_input, dict) else str(task_id_input)
            status_input = inputs_dict.get('status', {})
            status = status_input.get('value', '') if isinstance(status_input, dict) else str(status_input)
            return update_task_status(librarian, task_id, status)
        elif command == 'get_task_list':
            return get_task_list(librarian)
        else:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="error",
                result=f"Unknown command: {command}",
                result_description=f"The command '{command}' is not supported"
            ).to_dict()]
            
    except Exception as e:
        return [PluginOutput(
            success=False,
            name="error",
            result_type="error",
            result=str(e),
            result_description=f"Task manager execution failed: {str(e)}"
        ).to_dict()]


def create_task(librarian: LibrarianClient, goal: str) -> List[Dict[str, Any]]:
    """Create a new task"""
    try:
        data = librarian.get_task_list()
        new_task = {
            "id": generate_id('task'),
            "goal": goal,
            "status": "pending",
            "subtasks": []
        }
        data["tasks"].append(new_task)
        librarian.save_task_list(data)
        
        return [PluginOutput(
            success=True,
            name="task_created",
            result_type="object",
            result={"task_id": new_task["id"]},
            result_description=f"Successfully created task: {goal}"
        ).to_dict()]
        
    except Exception as e:
        return [PluginOutput(
            success=False,
            name="error",
            result_type="error",
            result=str(e),
            result_description=f"Failed to create task: {str(e)}"
        ).to_dict()]


def create_subtask(librarian: LibrarianClient, parent_task_id: str, goal: str) -> List[Dict[str, Any]]:
    """Create a new subtask under a parent task"""
    try:
        if not parent_task_id:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="error",
                result="Parent task ID is required for creating subtasks",
                result_description="Missing parent_task_id parameter"
            ).to_dict()]
        
        data = librarian.get_task_list()
        parent_task = None
        
        for task in data["tasks"]:
            if task["id"] == parent_task_id:
                parent_task = task
                break
        
        if not parent_task:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="error",
                result=f"Task with id {parent_task_id} not found",
                result_description=f"Parent task {parent_task_id} does not exist"
            ).to_dict()]
        
        new_subtask = {
            "id": generate_id('subtask'),
            "goal": goal,
            "status": "pending"
        }
        parent_task["subtasks"].append(new_subtask)
        librarian.save_task_list(data)
        
        return [PluginOutput(
            success=True,
            name="subtask_created",
            result_type="object",
            result={"subtask_id": new_subtask["id"]},
            result_description=f"Successfully created subtask: {goal}"
        ).to_dict()]
        
    except Exception as e:
        return [PluginOutput(
            success=False,
            name="error",
            result_type="error",
            result=str(e),
            result_description=f"Failed to create subtask: {str(e)}"
        ).to_dict()]


def update_task_status(librarian: LibrarianClient, task_id: str, status: str) -> List[Dict[str, Any]]:
    """Update the status of a task or subtask"""
    try:
        if not task_id:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="error",
                result="Task ID is required for status updates",
                result_description="Missing task_id parameter"
            ).to_dict()]
        
        if not status:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="error",
                result="Status is required for status updates",
                result_description="Missing status parameter"
            ).to_dict()]
        
        data = librarian.get_task_list()
        task_updated = False
        
        # Check main tasks
        for task in data["tasks"]:
            if task["id"] == task_id:
                task["status"] = status
                task_updated = True
                break
            # Check subtasks
            for subtask in task["subtasks"]:
                if subtask["id"] == task_id:
                    subtask["status"] = status
                    task_updated = True
                    break
            if task_updated:
                break
        
        if not task_updated:
            return [PluginOutput(
                success=False,
                name="error",
                result_type="error",
                result=f"Task or subtask with id {task_id} not found",
                result_description=f"No task found with ID {task_id}"
            ).to_dict()]
        
        librarian.save_task_list(data)
        
        return [PluginOutput(
            success=True,
            name="status_updated",
            result_type="object",
            result={"success": True},
            result_description=f"Successfully updated task {task_id} status to {status}"
        ).to_dict()]
        
    except Exception as e:
        return [PluginOutput(
            success=False,
            name="error",
            result_type="error",
            result=str(e),
            result_description=f"Failed to update task status: {str(e)}"
        ).to_dict()]


def get_task_list(librarian: LibrarianClient) -> List[Dict[str, Any]]:
    """Retrieve the complete task list"""
    try:
        data = librarian.get_task_list()
        
        return [PluginOutput(
            success=True,
            name="task_list",
            result_type="object",
            result=data,
            result_description="Successfully retrieved task list"
        ).to_dict()]
        
    except Exception as e:
        return [PluginOutput(
            success=False,
            name="error",
            result_type="error",
            result=str(e),
            result_description=f"Failed to retrieve task list: {str(e)}"
        ).to_dict()]


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps([{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": "Invalid arguments",
            "resultDescription": "Expected exactly one argument with input data"
        }]))
        sys.exit(1)
    
    try:
        inputs_str = sys.argv[1]
        inputs = json.loads(inputs_str)
        result = execute_task_manager(inputs)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps([{
            "success": False,
            "name": "error",
            "resultType": "error",
            "result": str(e),
            "resultDescription": f"Plugin execution failed: {str(e)}"
        }]))
        sys.exit(1)
