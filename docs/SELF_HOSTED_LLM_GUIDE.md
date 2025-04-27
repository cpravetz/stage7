# Self-Hosted LLM Integration Guide

This guide provides detailed instructions for integrating self-hosted Large Language Models (LLMs) with Stage7.

## Supported Self-Hosted LLM Interfaces

Stage7 currently supports the following interfaces for self-hosted LLMs:

1. **OpenWebUI Interface**: Compatible with OpenWebUI, LM Studio, Ollama, and other servers that implement the OpenAI API format
2. **Direct Llama.cpp Interface**: For direct integration with Llama.cpp servers
3. **Hugging Face Text Generation Interface**: For models hosted using the Hugging Face Text Generation Interface

## OpenWebUI Interface Setup

The OpenWebUI interface is the most versatile and recommended approach for integrating self-hosted LLMs.

### Prerequisites

- A running OpenWebUI server or compatible alternative (LM Studio, Ollama, etc.)
- Network connectivity between the Stage7 containers and the LLM server

### Configuration

1. Add the following to your `.env` file:

```
# Self-hosted LLM configuration
OPENWEBUI_API_URL=http://your-openwebui-server:5000
OPENWEBUI_API_KEY=your_openwebui_api_key
```

2. If running the LLM server on the same host as Stage7, use the host's IP address instead of `localhost` to ensure the containers can access it.

3. Restart the Brain service or the entire Stage7 stack:

```bash
docker compose restart brain
# or
docker compose down && docker compose up -d
```

### Supported Models

The OpenWebUI interface supports any model that implements the OpenAI API format, including:

- Llama 3 (8B, 70B)
- Mistral (7B, 8x7B)
- Qwen (7B, 14B, 72B)
- Phi-3 (3.8B, 14B)
- Claude (via compatible API)
- GPT models (via compatible API)

### Testing the Connection

After configuring the OpenWebUI interface, you can test the connection by:

1. Checking the Brain service logs:

```bash
docker compose logs brain
```

2. Look for messages indicating successful connection to your self-hosted LLM.

3. Create a simple mission in the Stage7 UI to test if the LLM is responding correctly.

## Direct Llama.cpp Interface Setup

For direct integration with Llama.cpp servers:

### Prerequisites

- A running Llama.cpp server with HTTP API enabled
- Network connectivity between the Stage7 containers and the Llama.cpp server

### Configuration

1. Add the following to your `.env` file:

```
# Llama.cpp configuration
LLAMACPP_API_URL=http://your-llamacpp-server:8080
```

2. Restart the Brain service:

```bash
docker compose restart brain
```

## Hugging Face Text Generation Interface

For models hosted using the Hugging Face Text Generation Interface:

### Prerequisites

- A running Text Generation Interface server
- Network connectivity between the Stage7 containers and the TGI server

### Configuration

1. Add the following to your `.env` file:

```
# Hugging Face TGI configuration
HUGGINGFACE_TGI_URL=http://your-tgi-server:8080
```

2. Restart the Brain service:

```bash
docker compose restart brain
```

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Ensure the LLM server is running and accessible from the Stage7 containers
   - Check firewall settings
   - Verify the URL and port are correct

2. **Authentication Errors**
   - Verify the API key is correct
   - Check if the LLM server requires authentication

3. **Model Loading Errors**
   - Ensure the model is properly loaded on the LLM server
   - Check if the model name is correctly specified

4. **Performance Issues**
   - Ensure the host has sufficient resources (RAM, GPU) for the model
   - Consider using a smaller model if performance is poor

### Checking Logs

To diagnose issues, check the Brain service logs:

```bash
docker compose logs brain
```

Look for error messages related to LLM connections or model loading.

## Advanced Configuration

### Model Selection Strategy

The Brain service automatically selects the best model for each task based on:

1. Model availability
2. Past performance
3. Task requirements

You can influence model selection by:

1. Setting model preferences in the Brain service configuration
2. Providing specific model requirements in mission creation

### Fallback Mechanisms

If a self-hosted model fails, the Brain service will:

1. Try alternative self-hosted models
2. Fall back to cloud-based models if configured
3. Report errors if no models are available

## Performance Optimization

For optimal performance with self-hosted LLMs:

1. Use models appropriate for your hardware capabilities
2. Enable GPU acceleration when available
3. Adjust context window size based on your use case
4. Consider quantized models for better performance on limited hardware

## Security Considerations

When using self-hosted LLMs:

1. Ensure network security between Stage7 and the LLM server
2. Be cautious with API keys and access controls
3. Consider data privacy implications when processing sensitive information
4. Regularly update your LLM server software for security patches
