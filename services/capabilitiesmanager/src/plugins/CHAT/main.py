#!/usr/bin/env python3
"""
CHAT Plugin
"""

import uuid
import requests
import os
import time
import logging
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

# --- Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- FastAPI App Setup ---
app = FastAPI(
    title="CHAT Plugin API",
    description="API for managing interactive chat sessions.",
    version="1.0.0"
)

# --- In-memory session storage ---
chat_sessions = {}

# --- Environment Variables & Constants ---
POSTOFFICE_URL = os.getenv('POSTOFFICE_URL', 'http://postoffice:5020')
SECURITY_MANAGER_URL = os.getenv('SECURITY_MANAGER_URL', 'http://securitymanager:5010')
CLIENT_SECRET = os.getenv('CLIENT_SECRET') # Should be injected by the runtime environment
PLUGIN_CLIENT_ID = "plugin-CHAT"
AUTH_TOKEN = None

# --- Pydantic Models for Request Bodies ---
class StartChatRequest(BaseModel):
    initial_message: str

class SendMessageRequest(BaseModel):
    session_id: str
    message: str

class EndChatRequest(BaseModel):
    session_id: str

# --- Helper Functions ---

def get_auth_token():
    """Gets or refreshes the auth token from the Security Manager."""
    global AUTH_TOKEN
    # In a real-world scenario, tokens should be cached and checked for expiration.
    # For this implementation, we fetch it once.
    if AUTH_TOKEN:
        return AUTH_TOKEN

    if not CLIENT_SECRET:
        logger.error("CLIENT_SECRET is not set. Cannot authenticate.")
        raise HTTPException(status_code=500, detail="Plugin is not configured with a client secret.")

    try:
        logger.info(f"Requesting auth token from {SECURITY_MANAGER_URL}")
        response = requests.post(
            f"{SECURITY_MANAGER_URL}/generateToken",
            json={"clientId": PLUGIN_CLIENT_ID, "clientSecret": CLIENT_SECRET},
            timeout=15
        )
        response.raise_for_status()
        token_data = response.json()
        AUTH_TOKEN = token_data.get('token')
        if not AUTH_TOKEN:
            logger.error("Failed to obtain auth token: 'token' field missing in response.")
            raise HTTPException(status_code=500, detail="Failed to obtain auth token")
        logger.info("Successfully obtained auth token.")
        return AUTH_TOKEN
    except requests.exceptions.RequestException as e:
        logger.error(f"Error contacting Security Manager: {e}")
        raise HTTPException(status_code=503, detail=f"Error contacting security manager: {e}")

def get_user_input(prompt: str) -> str:
    """
    Sends a prompt to the user via the PostOffice and waits for their response.
    This function polls for the result to provide a synchronous-like behavior.
    """
    token = get_auth_token()
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # 1. Send the request to PostOffice to ask the user a question
    request_id = None
    try:
        logger.info(f"Sending user input request to {POSTOFFICE_URL}")
        request_data = {"question": prompt, "answerType": "text"}
        response = requests.post(
            f"{POSTOFFICE_URL}/sendUserInputRequest",
            json=request_data,
            headers=headers,
            timeout=15
        )
        response.raise_for_status()
        response_data = response.json()
        request_id = response_data.get('request_id')
        if not request_id:
            logger.error("PostOffice did not return a request_id.")
            raise HTTPException(status_code=500, detail="PostOffice did not return a request_id")
        logger.info(f"User input request sent. request_id: {request_id}")
    except requests.exceptions.RequestException as e:
        logger.error(f"Error sending user input request to PostOffice: {e}")
        raise HTTPException(status_code=503, detail=f"Error sending user input request: {e}")

    # 2. Poll PostOffice for the user's response
    response_url = f"{POSTOFFICE_URL}/getUserInputResponse/{request_id}"
    max_wait_seconds = 300  # 5 minutes timeout
    poll_interval_seconds = 2
    start_time = time.time()

    logger.info(f"Polling for response at {response_url}")
    while time.time() - start_time < max_wait_seconds:
        try:
            poll_response = requests.get(response_url, headers=headers, timeout=10)
            if poll_response.status_code == 200:
                data = poll_response.json()
                if data.get('status') == 'completed' and 'response' in data:
                    logger.info(f"Received user response for request_id: {request_id}")
                    return data['response']
                # If status is 'pending' or other, continue polling
            else:
                # Log non-200 responses but continue polling unless it's a fatal error
                logger.warning(f"Polling for user response returned status {poll_response.status_code}")
        except requests.exceptions.RequestException as e:
            logger.warning(f"Polling request failed: {e}. Retrying...")
        
        time.sleep(poll_interval_seconds)

    logger.error(f"Timed out waiting for user response for request_id: {request_id}")
    raise HTTPException(status_code=408, detail="Timed out waiting for user response")


# --- API Endpoints ---

@app.post("/start_chat", summary="Start a new chat session")
async def start_chat(request: StartChatRequest):
    """
    Starts a new chat session, sends an initial message to the user,
    and returns the user's first response.
    """
    session_id = str(uuid.uuid4())
    chat_sessions[session_id] = {"history": []}
    logger.info(f"Starting new chat session: {session_id}")
    
    try:
        user_response = get_user_input(request.initial_message)
        chat_sessions[session_id]["history"].append({"agent": request.initial_message, "user": user_response})
        return {"session_id": session_id, "response": user_response}
    except HTTPException as e:
        # Clean up the session if the initial interaction fails
        if session_id in chat_sessions:
            del chat_sessions[session_id]
        logger.error(f"Failed to start chat session {session_id}: {e.detail}")
        raise e

@app.post("/send_message", summary="Send a message to the user")
async def send_message(request: SendMessageRequest):
    """
    Sends a follow-up message in an existing chat session and returns the user's response.
    """
    if request.session_id not in chat_sessions:
        logger.warning(f"Attempted to send message to non-existent session: {request.session_id}")
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    logger.info(f"Sending message in session: {request.session_id}")
    user_response = get_user_input(request.message)
    chat_sessions[request.session_id]["history"].append({"agent": request.message, "user": user_response})
    return {"response": user_response}

@app.post("/end_chat", summary="End the chat session")
async def end_chat(request: EndChatRequest):
    """
    Ends and cleans up an existing chat session.
    """
    if request.session_id not in chat_sessions:
        logger.warning(f"Attempted to end non-existent session: {request.session_id}")
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    del chat_sessions[request.session_id]
    logger.info(f"Ended chat session: {request.session_id}")
    return {"message": "Chat session ended successfully."}

@app.get("/health", summary="Health check")
async def health_check():
    """A simple health check endpoint."""
    return {"status": "ok"}

# To run this app, use a command like:
# uvicorn main:app --host 0.0.0.0 --port 8000