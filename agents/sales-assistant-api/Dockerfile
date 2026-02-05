# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/sales-assistant-api/package.json ./agents/sales-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=sales-assistant-api

# Copy agent source code
COPY agents/sales-assistant-api/ ./agents/sales-assistant-api/

# Build the agent
RUN npm run build --workspace=sales-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/sales-assistant-api

EXPOSE 3005

CMD ["node", "dist/index.js"]
