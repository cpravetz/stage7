# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/event-assistant-api/package.json ./agents/event-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=event-assistant-api

# Copy agent source code
COPY agents/event-assistant-api/ ./agents/event-assistant-api/

# Build the agent
RUN npm run build --workspace=event-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/event-assistant-api

EXPOSE 3003

CMD ["node", "dist/index.js"]
