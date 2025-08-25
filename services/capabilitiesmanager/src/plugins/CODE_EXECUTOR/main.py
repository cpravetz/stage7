def execute_plugin(inputs):
    """
    Executes the CODE_EXECUTOR plugin.
    """
    language = inputs.get("language")
    code = inputs.get("code")

    if not language or not code:
        return json.dumps({
            "stdout": "",
            "stderr": "Language and code are required.",
            "exit_code": 1
        })

    if language not in ["python", "javascript"]:
        return json.dumps({
            "stdout": "",
            "stderr": f"Language '{language}' is not supported.",
            "exit_code": 1
        })

    try:
        client = docker.from_env()
        image_tag = f"code-executor-{language}"
        dockerfile_path = os.path.join(os.path.dirname(__file__), f"Dockerfile.{language}")

        # Build the Docker image
        try:
            client.images.get(image_tag)
        except docker.errors.ImageNotFound:
            client.images.build(
                path=os.path.dirname(__file__),
                dockerfile=f"Dockerfile.{language}",
                tag=image_tag
            )

        # Run the Docker container
        container = client.containers.run(
            image=image_tag,
            command=["sh", "-c", "python -c 'import sys; exec(sys.stdin.read())'" if language == "python" else "node -e \"const fs = require('fs'); const code = fs.readFileSync(0, 'utf-8'); eval(code);\""],
            stdin_open=True,
            detach=True
        )

        # Write code to container's stdin
        sock = container.attach_socket()
        sock._sock.sendall(code.encode('utf-8'))
        sock._sock.close()
        
        result = container.wait()
        
        stdout = container.logs(stdout=True, stderr=False).decode('utf-8')
        stderr = container.logs(stdout=False, stderr=True).decode('utf-8')
        
        container.remove()

        return json.dumps({
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": result['StatusCode']
        })

    except docker.errors.DockerException as e:
        return json.dumps({
            "stdout": "",
            "stderr": f"Docker error: {str(e)}",
            "exit_code": 1
        })
    except Exception as e:
        return json.dumps({
            "stdout": "",
            "stderr": f"An unexpected error occurred: {str(e)}",
            "exit_code": 1
        })

import sys
import json
import docker
import os
import tempfile
import shutil
import hashlib

# Error handler integration
def send_to_errorhandler(error, context=None):
    try:
        import requests
        errorhandler_url = os.environ.get('ERRORHANDLER_URL', 'errorhandler:5090')
        payload = {
            'error': str(error),
            'context': context or ''
        }
        requests.post(f'http://{errorhandler_url}/analyze', json=payload, timeout=10)
    except Exception as e:
        print(f"Failed to send error to errorhandler: {e}")

seen_hashes = set()

def execute_plugin(inputs):
    """
    Executes the CODE_EXECUTOR plugin with robust error handling, deduplication, temp dir hygiene, and error escalation.
    """
    temp_dir = None
    try:
        # Deduplication: hash the inputs
        hash_input = json.dumps(inputs, sort_keys=True)
        input_hash = hashlib.sha256(hash_input.encode()).hexdigest()
        if input_hash in seen_hashes:
            raise Exception("Duplicate input detected. This input combination has already failed. Aborting to prevent infinite loop.")
        seen_hashes.add(input_hash)

        # Temp directory hygiene
        temp_dir = tempfile.mkdtemp(prefix="code_executor_")
        os.environ["CODE_EXECUTOR_TEMP_DIR"] = temp_dir

        language = inputs.get("language")
        code = inputs.get("code")

        if not language or not code:
            raise ValueError("Language and code are required.")

        if language not in ["python", "javascript"]:
            raise ValueError(f"Language '{language}' is not supported.")

        client = docker.from_env()
        image_tag = f"code-executor-{language}"
        dockerfile_path = os.path.join(os.path.dirname(__file__), f"Dockerfile.{language}")

        # Build the Docker image
        try:
            client.images.get(image_tag)
        except docker.errors.ImageNotFound:
            client.images.build(
                path=os.path.dirname(__file__),
                dockerfile=f"Dockerfile.{language}",
                tag=image_tag
            )

        # Run the Docker container
        container = client.containers.run(
            image=image_tag,
            command=["sh", "-c", "python -c 'import sys; exec(sys.stdin.read())'" if language == "python" else "node -e \"const fs = require('fs'); const code = fs.readFileSync(0, 'utf-8'); eval(code);\""],
            stdin_open=True,
            detach=True
        )

        # Write code to container's stdin
        sock = container.attach_socket()
        sock._sock.sendall(code.encode('utf-8'))
        sock._sock.close()

        result = container.wait()

        stdout = container.logs(stdout=True, stderr=False).decode('utf-8')
        stderr = container.logs(stdout=False, stderr=True).decode('utf-8')

        container.remove()

        # Strict output schema validation
        output = {
            "stdout": stdout,
            "stderr": stderr,
            "exit_code": result['StatusCode']
        }
        if not isinstance(output["stdout"], str) or not isinstance(output["stderr"], str) or not isinstance(output["exit_code"], int):
            raise ValueError("Output schema validation failed: stdout/stderr must be strings, exit_code must be int.")

        return json.dumps(output)

    except Exception as e:
        send_to_errorhandler(e, context=json.dumps(inputs))
        return json.dumps({
            "stdout": "",
            "stderr": f"Error: {str(e)}",
            "exit_code": 1
        })
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
            except Exception as cleanup_err:
                print(f"Failed to clean up temp dir {temp_dir}: {cleanup_err}")

if __name__ == "__main__":
    # Read input from stdin
    raw_input_str = sys.stdin.read()
    
    # Attempt to clean the input string before parsing as JSON
    # Remove common markdown code block fences and any leading/trailing whitespace
    cleaned_input_str = raw_input_str.strip()
    if cleaned_input_str.startswith('```json'):
        cleaned_input_str = cleaned_input_str[7:].strip()
    elif cleaned_input_str.startswith('```'):
        cleaned_input_str = cleaned_input_str[3:].strip()
    if cleaned_input_str.endswith('```'):
        cleaned_input_str = cleaned_input_str[:-3].strip()

    try:
        input_data = json.loads(cleaned_input_str)
        print(execute_plugin(input_data))
    except json.JSONDecodeError as e:
        # If JSON decoding still fails, log the error and return a structured error output
        error_message = f"JSONDecodeError: {e}. Raw input: {raw_input_str[:200]}..."
        send_to_errorhandler(error_message, context={"raw_input": raw_input_str})
        print(json.dumps({
            "stdout": "",
            "stderr": f"Error: Invalid JSON input to CODE_EXECUTOR plugin: {e}",
            "exit_code": 1
        }))
    except Exception as e:
        send_to_errorhandler(e, context=json.dumps({"raw_input": raw_input_str}))
        print(json.dumps({
            "stdout": "",
            "stderr": f"An unexpected error occurred during input processing: {str(e)}",
            "exit_code": 1
        }))