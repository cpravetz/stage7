/**
 * Script to set NODE_ENV to development in docker-compose.yaml
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Path to docker-compose.yaml
const dockerComposePath = path.join(__dirname, 'docker-compose.yaml');

// Read docker-compose.yaml
console.log(`Reading ${dockerComposePath}...`);
const dockerComposeContent = fs.readFileSync(dockerComposePath, 'utf8');

// Parse YAML
const dockerCompose = yaml.load(dockerComposeContent);

// Set NODE_ENV to development for all services
let servicesUpdated = 0;
for (const [serviceName, serviceConfig] of Object.entries(dockerCompose.services)) {
  if (serviceConfig.environment) {
    // Check if NODE_ENV is already set
    let nodeEnvFound = false;
    
    // If environment is an array, convert it to an object
    if (Array.isArray(serviceConfig.environment)) {
      const envObject = {};
      for (const env of serviceConfig.environment) {
        const [key, value] = env.split('=');
        envObject[key] = value;
        if (key === 'NODE_ENV') {
          nodeEnvFound = true;
          if (value !== 'development') {
            console.log(`Setting NODE_ENV to development for service ${serviceName} (was ${value})`);
            envObject[key] = 'development';
            servicesUpdated++;
          }
        }
      }
      serviceConfig.environment = envObject;
    } else {
      // Environment is an object
      if ('NODE_ENV' in serviceConfig.environment) {
        nodeEnvFound = true;
        if (serviceConfig.environment.NODE_ENV !== 'development') {
          console.log(`Setting NODE_ENV to development for service ${serviceName} (was ${serviceConfig.environment.NODE_ENV})`);
          serviceConfig.environment.NODE_ENV = 'development';
          servicesUpdated++;
        }
      }
    }
    
    // Add NODE_ENV if not found
    if (!nodeEnvFound) {
      console.log(`Adding NODE_ENV=development to service ${serviceName}`);
      serviceConfig.environment.NODE_ENV = 'development';
      servicesUpdated++;
    }
  } else {
    // Add environment if not present
    console.log(`Adding environment with NODE_ENV=development to service ${serviceName}`);
    serviceConfig.environment = {
      NODE_ENV: 'development'
    };
    servicesUpdated++;
  }
}

// Convert back to YAML
const updatedDockerComposeContent = yaml.dump(dockerCompose, {
  lineWidth: -1,
  noRefs: true
});

// Write back to docker-compose.yaml
fs.writeFileSync(dockerComposePath, updatedDockerComposeContent, 'utf8');

console.log(`Updated ${servicesUpdated} services to use NODE_ENV=development`);
console.log('Please run "docker compose down && docker compose build && docker compose up -d" to apply changes');
