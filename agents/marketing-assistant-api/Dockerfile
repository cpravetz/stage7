# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/marketing-assistant-api/package.json ./agents/marketing-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=marketing-assistant-api

# Copy agent source code
COPY agents/marketing-assistant-api/ ./agents/marketing-assistant-api/

# Build the agent
RUN npm run build --workspace=marketing-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/marketing-assistant-api

EXPOSE 3009

CMD ["node", "dist/index.js"]
