# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/content-creator-assistant-api/package.json ./agents/content-creator-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=content-creator-assistant-api

# Copy agent source code
COPY agents/content-creator-assistant-api/ ./agents/content-creator-assistant-api/

# Build the agent
RUN npm run build --workspace=content-creator-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/content-creator-assistant-api

EXPOSE 3001

CMD ["node", "dist/index.js"]
