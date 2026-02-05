# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/support-assistant-api/package.json ./agents/support-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=support-assistant-api

# Copy agent source code
COPY agents/support-assistant-api/ ./agents/support-assistant-api/

# Build the agent
RUN npm run build --workspace=support-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/support-assistant-api

EXPOSE 3010

CMD ["node", "dist/index.js"]
