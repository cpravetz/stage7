#!/bin/bash
cd /usr/src/agents

# Map of agent names to ports
declare -A ports
ports["content-creator-assistant-api"]=3001
ports["hr-assistant-api"]=3007
ports["support-assistant-api"]=3010
ports["sports-wager-advisor-api"]=3018
ports["songwriter-assistant-api"]=3012
ports["sales-assistant-api"]=3005
ports["scriptwriter-assistant-api"]=3013
ports["marketing-assistant-api"]=3009
ports["performance-analytics-api"]=3011
ports["restaurant-ops-assistant-api"]=3016
ports["finance-assistant-api"]=3014
ports["healthcare-assistant-api"]=3015
ports["hotel-ops-assistant-api"]=3017
ports["education-assistant-api"]=3006
ports["executive-assistant-api"]=3008
ports["legal-assistant-api"]=3004
ports["cto-assistant-api"]=3020
ports["career-assistant-api"]=3021
ports["event-assistant-api"]=3003
ports["pm-assistant-api"]=3000

for agent_dir in *-api; do
  port=${ports[$agent_dir]:-3000}
  cat > "$agent_dir/Dockerfile" << EOF
# Build on top of pre-built base image
FROM cktmcs:base

# Copy agent source code
COPY agents/$agent_dir/ ./agents/$agent_dir/

# Build the agent
RUN npm run build --workspace=$agent_dir

# Set working directory to the agent's folder
WORKDIR /usr/src/app/agents/$agent_dir

EXPOSE $port

CMD ["node", "dist/index.js"]
EOF
done
