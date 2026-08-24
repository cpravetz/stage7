# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/hotel-ops-assistant-api/package.json ./agents/hotel-ops-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=hotel-ops-assistant-api

# Copy agent source code
COPY agents/hotel-ops-assistant-api/ ./agents/hotel-ops-assistant-api/

# Build the agent
RUN npm run build --workspace=hotel-ops-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/hotel-ops-assistant-api

EXPOSE 3017

CMD ["node", "dist/index.js"]
