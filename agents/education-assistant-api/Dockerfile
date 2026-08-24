# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent package.json first
COPY agents/education-assistant-api/package.json ./agents/education-assistant-api/

# Install agent dependencies
RUN npm install --legacy-peer-deps --workspace=education-assistant-api

# Copy agent source code
COPY agents/education-assistant-api/ ./agents/education-assistant-api/

# Build the agent
RUN npm run build --workspace=education-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/education-assistant-api

EXPOSE 3006

CMD ["node", "dist/index.js"]
