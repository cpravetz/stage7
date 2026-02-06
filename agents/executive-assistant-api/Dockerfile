# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/executive-assistant-api/package.json ./agents/executive-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=executive-assistant-api

# Copy agent source code
COPY agents/executive-assistant-api/ ./agents/executive-assistant-api/

# Build the agent
RUN npm run build --workspace=executive-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/executive-assistant-api

EXPOSE 3008

CMD ["node", "dist/index.js"]
