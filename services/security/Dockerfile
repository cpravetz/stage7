# Build on top of pre-built base image
FROM cktmcs:base

# Copy service package.json first for workspace registration
COPY services/security/package.json ./services/security/

# Install service dependencies
RUN npm install --legacy-peer-deps --workspace=services/security

# Copy service source code
COPY services/security/ ./services/security/

# Build the service
RUN npm run build --workspace=services/security

# Set working directory to the service's folder
WORKDIR /usr/src/app/services/security

EXPOSE 5010

CMD ["node", "dist/SecurityManager.js"]
