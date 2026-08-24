# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/finance-assistant-api/package.json ./agents/finance-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=finance-assistant-api

# Copy agent source code
COPY agents/finance-assistant-api/ ./agents/finance-assistant-api/

# Build the agent
RUN npm run build --workspace=finance-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/finance-assistant-api

EXPOSE 3014

CMD ["node", "dist/index.js"]
