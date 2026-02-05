
import pytest
import requests
import os
import time
import json
from requests.exceptions import ConnectionError

# Base URL for the L3 API Gateway (pm-assistant-api)
# This assumes the Docker Compose setup exposes it on localhost:5000 (or similar)
L3_API_BASE_URL = os.environ.get("L3_API_BASE_URL", "http://localhost:5000")

# Base URL for MissionControl (L1 service)
MISSION_CONTROL_BASE_URL = os.environ.get("MISSION_CONTROL_BASE_URL", "http://localhost:5004")

# Base URL for CapabilitiesManager (L1 service)
CAPABILITIES_MANAGER_BASE_URL = os.environ.get("CAPABILITIES_MANAGER_BASE_URL", "http://localhost:5003")

# It's crucial to ensure that all services are up and running before tests begin.
# A simple health check fixture can be added here if needed, or rely on Docker Compose's
# 'depends_on' and 'healthcheck' configuration.

@pytest.fixture(scope="session", autouse=True)
def health_check():
    """
    Ensure all necessary services are running before starting tests.
    """
    required_services = {
        "MissionControl": f"{MISSION_CONTROL_BASE_URL}/health",
        "CapabilitiesManager": f"{CAPABILITIES_MANAGER_BASE_URL}/health",
        "L3 API Gateway": f"{L3_API_BASE_URL}/health" # Assuming L3 API also has a health endpoint
    }
    
    for service_name, url in required_services.items():
        print(f"Checking {service_name} health at {url}...")
        retries = 10
        for i in range(retries):
            try:
                response = requests.get(url, timeout=5)
                response.raise_for_status() # Raise an exception for HTTP errors (4xx or 5xx)
                print(f"{service_name} is healthy.")
                break
            except ConnectionError:
                print(f"{service_name} not reachable, retrying in 5 seconds... ({i+1}/{retries})")
                time.sleep(5)
            except Exception as e:
                print(f"Error checking {service_name} health: {e}, retrying in 5 seconds... ({i+1}/{retries})")
                time.sleep(5)
        else:
            pytest.fail(f"Service {service_name} did not become healthy after multiple retries.")
    
    print("All required services are healthy. Starting tests...")


@pytest.fixture(scope="session")
def auth_token():
    """
    Fixture to obtain an authentication token for API requests.
    In a real scenario, this would involve logging in or using an admin token.
    For E2E tests, we might use a predefined token or a simple mock/bypass if available.
    For now, returning a placeholder.
    """
    # TODO: Implement actual token retrieval if authentication is enabled in E2E setup
    return "test-auth-token"

@pytest.fixture(scope="function")
def new_mission(auth_token):
    """
    Fixture to create a new mission for each test function and clean it up afterwards.
    """
    create_mission_url = f"{L3_API_BASE_URL}/missions"
    headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    # Create a dummy mission
    mission_data = {
        "goal": "Test E2E mission lifecycle by drafting a short product spec.",
        "description": "An E2E test mission to verify L3-L1 integration."
    }
    
    response = requests.post(create_mission_url, headers=headers, data=json.dumps(mission_data))
    response.raise_for_status()
    mission_id = response.json()["missionId"]
    
    print(f"Created test mission: {mission_id}")
    yield mission_id
    
    # Teardown: Clean up the mission
    delete_mission_url = f"{L3_API_BASE_URL}/missions/{mission_id}"
    requests.delete(delete_mission_url, headers=headers) # Assuming a DELETE endpoint exists
    print(f"Cleaned up test mission: {mission_id}")

def test_mission_creation_and_status(auth_token, new_mission):
    """
    Test that a mission can be created and its status can be retrieved.
    """
    mission_id = new_mission
    get_mission_url = f"{L3_API_BASE_URL}/missions/{mission_id}/status"
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    response = requests.get(get_mission_url, headers=headers)
    response.raise_for_status()
    status_data = response.json()
    
    assert status_data["missionId"] == mission_id
    assert status_data["status"] in ["CREATED", "RUNNING", "PAUSED", "COMPLETED", "FAILED"] # Initial status could vary
    print(f"Mission {mission_id} status: {status_data['status']}")

def test_l3_to_l1_tool_execution(auth_token, new_mission):
    """
    Test the delegation of a tool execution from L3 API to L1 agent system.
    This simulates the pm-assistant-api triggering an L1 tool call.
    """
    mission_id = new_mission
    
    # This endpoint translates an L3 action into an L1 agent task.
    # From SYSTEM_SHORTCOMINGS.md: POST /missions/:missionId/execute-tool on mission-control
    # The L3 client RealCoreEngineClient calls this endpoint.
    execute_tool_url = f"{MISSION_CONTROL_BASE_URL}/missions/{mission_id}/execute-tool" # This is an L1 endpoint directly
    headers = {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    # Simulate an L3 SDK JiraTool.getIssueDetails() call
    tool_payload = {
        "toolName": "JiraTool",
        "action": "getIssueDetails",
        "inputs": {
            "issueId": "DM-123"
        }
    }

    print(f"Attempting to execute tool via L1 MissionControl for mission {mission_id}...")
    response = requests.post(execute_tool_url, headers=headers, data=json.dumps(tool_payload))
    response.raise_for_status()
    
    result = response.json()
    
    # Assertions for the structure and content of the result
    assert isinstance(result, dict)
    assert "success" in result
    assert result["success"] is True
    assert "name" in result
    assert result["name"] == "tool_execution_result"
    assert "resultType" in result
    assert result["resultType"] == "tool_output"
    assert "resultDescription" in result
    assert "JiraTool_getIssueDetails" in result["resultDescription"] # Should reflect the synthetic verb
    assert "result" in result
    assert isinstance(result["result"], dict) # The actual output of the tool should be a dictionary
    assert "mimeType" in result
    assert result["mimeType"] == "application/json"
    
    # Further checks: Poll mission status, check for steps created in agentset, etc.
    print(f"Tool execution for mission {mission_id} successful. Result: {result.get('resultDescription')}")

# TODO: Add more E2E tests for:
# - Multi-step plan execution (e.g., triggering ACCOMPLISH verb via L3 action)
# - Deliverable creation and retrieval
# - Error handling and recovery scenarios
# - Long-running mission monitoring
