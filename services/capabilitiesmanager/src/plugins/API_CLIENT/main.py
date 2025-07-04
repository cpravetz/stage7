import requests
import json

def execute_plugin(inputs):
    """
    A generic interface for interacting with third-party RESTful APIs.
    """
    method = inputs.get("method")
    url = inputs.get("url")
    headers = inputs.get("headers", {})
    body = inputs.get("body", {})
    auth = inputs.get("auth", {})

    if not method or not url:
        return {"error": "The 'method' and 'url' parameters are required."}

    # Authentication handling
    auth_strategy = None
    if auth:
        auth_type = auth.get("type")
        if auth_type == "bearer":
            headers["Authorization"] = f"Bearer {auth.get('token')}"
        elif auth_type == "api_key":
            headers[auth.get("key")] = auth.get("value")
        elif auth_type == "basic":
            auth_strategy = (auth.get("username"), auth.get("password"))

    try:
        response = requests.request(
            method=method.upper(),
            url=url,
            headers=headers,
            json=body,
            auth=auth_strategy
        )
        response.raise_for_status()  # Raise an exception for bad status codes

        # Try to parse the response body as JSON
        try:
            response_body = response.json()
        except json.JSONDecodeError:
            response_body = response.text

        return {
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "body": response_body
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e)}