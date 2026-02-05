# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/cto-assistant-api/package.json ./agents/cto-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=cto-assistant-api

# Copy agent source code
COPY agents/cto-assistant-api/ ./agents/cto-assistant-api/

# Build the agent
RUN npm run build --workspace=cto-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/cto-assistant-api

EXPOSE 3020

CMD ["node", "dist/index.js"]
