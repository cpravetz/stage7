import { ConfigClient } from '../shared/src/config/configClient';

/**
 * Example of using the ConfigClient to retrieve and update configuration values
 */
async function main() {
  // Create an instance of ConfigClient
  const configClient = new ConfigClient();
  
  try {
    // Get a configuration value
    const appName = await configClient.get('app.name', 'Stage7');
    console.log(`App name: ${appName}`);
    
    // Get a configuration value with a default
    const logLevel = await configClient.get('log.level', 'info');
    console.log(`Log level: ${logLevel}`);
    
    // Set a configuration value
    await configClient.set('app.version', '1.1.0', 'Application version');
    console.log('Updated app.version to 1.1.0');
    
    // Get the updated value
    const appVersion = await configClient.get('app.version', '1.0.0');
    console.log(`App version: ${appVersion}`);
    
    // Change environment
    configClient.setEnvironment('production');
    console.log('Switched to production environment');
    
    // Get a production-specific value
    const productionSetting = await configClient.get('production.setting', 'default');
    console.log(`Production setting: ${productionSetting}`);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example
main().catch(console.error);
