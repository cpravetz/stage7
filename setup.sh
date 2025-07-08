#!/bin/bash
set -e

# Update package lists
sudo apt-get update

# Install Node.js 18.x (LTS)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python 3 and pip (needed for Python plugins)
sudo apt-get install -y python3 python3-pip python3-venv

# Verify installations
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Python version: $(python3 --version)"

# Navigate to workspace directory
cd /mnt/persist/workspace

# Install dependencies for the entire workspace
npm install

# Build shared packages first (they are dependencies for other packages)
cd shared && npm run build && cd ..
cd errorhandler && npm run build && cd ..
cd marketplace && npm run build && cd ..

# Build all services
npm run build --workspaces

# Add Node.js and npm to PATH in profile
echo 'export PATH="/usr/bin:$PATH"' >> $HOME/.profile
echo 'export PATH="./node_modules/.bin:$PATH"' >> $HOME/.profile

echo "Setup completed successfully!"