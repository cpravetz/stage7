import sys
import json
import docker
import os

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

if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_data = json.loads(sys.argv[1])
        print(execute_plugin(input_data))
    else:
        # For local testing
        test_input = {
            "language": "python",
            "code": "print('Hello from Python!')"
        }
        print(execute_plugin(test_input))