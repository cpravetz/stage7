# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/restaurant-ops-assistant-api/package.json ./agents/restaurant-ops-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=restaurant-ops-assistant-api

# Copy agent source code
COPY agents/restaurant-ops-assistant-api/ ./agents/restaurant-ops-assistant-api/

# Build the agent
RUN npm run build --workspace=restaurant-ops-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/restaurant-ops-assistant-api

EXPOSE 3016

CMD ["node", "dist/index.js"]
