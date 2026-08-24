# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first for workspace registration
COPY agents/pm-assistant-api/package.json ./agents/pm-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=pm-assistant-api

# Copy agent source code
COPY agents/pm-assistant-api/ ./agents/pm-assistant-api/

# Build the agent
RUN npm run build --workspace=pm-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/pm-assistant-api

EXPOSE 3000

CMD ["node", "dist/index.js"]
