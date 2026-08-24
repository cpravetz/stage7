# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first for workspace registration
COPY agents/investment-advisor-api/package.json ./agents/investment-advisor-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=investment-advisor-api

# Copy agent source code
COPY agents/investment-advisor-api/ ./agents/investment-advisor-api/

# Build the agent
RUN npm run build --workspace=investment-advisor-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/investment-advisor-api

EXPOSE 3025

CMD ["node", "dist/index.js"]
