# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/career-assistant-api/package.json ./agents/career-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=career-assistant-api

# Copy agent source code
COPY agents/career-assistant-api/ ./agents/career-assistant-api/

# Build the agent
RUN npm run build --workspace=career-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/career-assistant-api

EXPOSE 3021

CMD ["node", "dist/index.js"]
