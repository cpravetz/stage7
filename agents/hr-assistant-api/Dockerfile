# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/hr-assistant-api/package.json ./agents/hr-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=hr-assistant-api

# Copy agent source code
COPY agents/hr-assistant-api/ ./agents/hr-assistant-api/

# Build the agent
RUN npm run build --workspace=hr-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/hr-assistant-api

EXPOSE 3007

CMD ["node", "dist/index.js"]
