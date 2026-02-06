# Build on top of pre-built base image
FROM cktmcs:base

# Copy root package files to ensure workspace setup
COPY package.json package-lock.json ./

# Copy services package.json (needed for mcsreact)
COPY services/mcsreact/package.json ./services/mcsreact/

# Copy agent package.json
COPY agents/scriptwriter-assistant-api/package.json ./agents/scriptwriter-assistant-api/

# Install all dependencies (includes agent)
RUN npm install --legacy-peer-deps

# Copy agent source code
COPY agents/scriptwriter-assistant-api/ ./agents/scriptwriter-assistant-api/

# Build the agent
RUN npm run build --workspace=scriptwriter-assistant-api

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/scriptwriter-assistant-api

EXPOSE 3016

CMD ["node", "dist/index.js"]
