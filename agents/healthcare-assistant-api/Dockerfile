# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first for workspace registration
COPY agents/healthcare-assistant-api/package.json ./agents/healthcare-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=healthcare-assistant-api

# Copy agent source code
COPY agents/healthcare-assistant-api/ ./agents/healthcare-assistant-api/

# Build the agent
RUN npm run build --workspace=healthcare-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/healthcare-assistant-api

EXPOSE 3015

CMD ["node", "dist/index.js"]
