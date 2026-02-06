# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/performance-analytics-api/package.json ./agents/performance-analytics-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=performance-analytics-api

# Copy agent source code
COPY agents/performance-analytics-api/ ./agents/performance-analytics-api/

# Build the agent
RUN npm run build --workspace=performance-analytics-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/performance-analytics-api

EXPOSE 3011

CMD ["node", "dist/index.js"]
