# Security Improvements

## Overview

This document outlines the security improvements made to the Stage7 system to address exposed private keys and API keys.

## Issues Addressed

1. **Exposed Private Keys**
   - Private RSA keys used for JWT signing and plugin signing were committed to the repository
   - These keys were located in `services/security/keys` and `shared/keys` directories

2. **Exposed API Keys**
   - The Groq API key was hardcoded in the `docker-compose.yaml` file

## Implemented Solutions

### 1. Updated .gitignore

The `.gitignore` file has been updated to exclude private keys and sensitive files:

```
# Private keys and sensitive files
*.pem
*.key
*private*

# Specific sensitive directories
services/security/keys/**
shared/keys/**

# Allow public keys to be committed
!*public*.pem
!*public*.key
```

### 2. Environment Variables for API Keys

The `docker-compose.yaml` file has been updated to use environment variables for API keys:

```yaml
# Use environment variable for GROQ_API_KEY
GROQ_API_KEY: ${GROQ_API_KEY:-''}
```

### 3. Key Regeneration Script

A script (`regenerate_keys.js`) has been created to regenerate all RSA key pairs:

```javascript
node regenerate_keys.js
```

This script:
- Generates new RSA key pairs for JWT signing and plugin signing
- Saves the keys to the appropriate directories
- Ensures proper permissions are set

### 4. Environment Variables Documentation

An `.env.example` file has been created to document required environment variables:

```
# API Keys
GROQ_API_KEY=your_groq_api_key_here

# GitHub Integration
GITHUB_TOKEN=your_github_token_here
...
```

## Required Actions

1. **Regenerate Keys**
   ```
   node regenerate_keys.js
   ```

2. **Create .env File**
   ```
   cp .env.example .env
   ```
   Then edit the `.env` file to add your new Groq API key.

3. **Rebuild Docker Containers**
   ```
   docker compose down && docker compose build && docker compose up -d
   ```

4. **Revoke Exposed API Keys**
   - Revoke the exposed Groq API key
   - Generate a new API key and add it to your `.env` file

## Best Practices for Sensitive Information

1. **Never commit sensitive information to Git**
   - Use environment variables for API keys, passwords, and other secrets
   - Use `.gitignore` to exclude sensitive files

2. **Rotate keys regularly**
   - Regenerate RSA keys periodically
   - Rotate API keys on a regular schedule

3. **Use secret management solutions**
   - Consider using Docker secrets, Kubernetes secrets, or a dedicated secret management service
   - Implement proper access controls for sensitive information

4. **Monitor for exposed secrets**
   - Use tools like GitGuardian or GitHub's secret scanning to detect exposed secrets
   - Set up alerts for potential security issues
