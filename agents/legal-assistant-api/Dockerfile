# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/legal-assistant-api/package.json ./agents/legal-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=legal-assistant-api

# Copy agent source code
COPY agents/legal-assistant-api/ ./agents/legal-assistant-api/

# Build the agent
RUN npm run build --workspace=legal-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/legal-assistant-api

EXPOSE 3004

CMD ["node", "dist/index.js"]
