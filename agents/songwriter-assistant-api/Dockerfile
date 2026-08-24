# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/songwriter-assistant-api/package.json ./agents/songwriter-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=songwriter-assistant-api

# Copy agent source code
COPY agents/songwriter-assistant-api/ ./agents/songwriter-assistant-api/

# Build the agent
RUN npm run build --workspace=songwriter-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/songwriter-assistant-api

EXPOSE 3012

CMD ["node", "dist/index.js"]
