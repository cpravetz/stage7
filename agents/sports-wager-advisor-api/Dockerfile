# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first for workspace registration
COPY agents/sports-wager-advisor-api/package.json ./agents/sports-wager-advisor-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=sports-wager-advisor-api

# Copy agent source code
COPY agents/sports-wager-advisor-api/ ./agents/sports-wager-advisor-api/

# Build the agent
RUN npm run build --workspace=sports-wager-advisor-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/sports-wager-advisor-api

EXPOSE 3018

CMD ["node", "dist/index.js"]
