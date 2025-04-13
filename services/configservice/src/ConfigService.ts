import express from 'express';
import bodyParser from 'body-parser';
import { BaseEntity } from '@cktmcs/shared';
import fs from 'fs/promises';
import path from 'path';
import { analyzeError } from '@cktmcs/errorhandler';

interface ConfigItem {
  key: string;
  value: any;
  environment: string;
  description?: string;
  lastUpdated: string;
}

export class ConfigService extends BaseEntity {
  private app: express.Application;
  private configDir: string;
  private configs: Map<string, ConfigItem> = new Map();

  constructor() {
    super('ConfigService', 'ConfigService', process.env.HOST || 'configservice', process.env.PORT || '5090');
    this.app = express();
    this.configDir = process.env.CONFIG_DIR || './config';
    this.initializeServer();
    this.loadConfigurations();
  }

  private async loadConfigurations() {
    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Load configuration files for each environment
      const environments = ['default', 'development', 'staging', 'production'];

      for (const env of environments) {
        const configPath = path.join(this.configDir, `${env}.json`);

        try {
          const configData = await fs.readFile(configPath, 'utf-8');
          const config = JSON.parse(configData);

          // Store each config item in the map
          for (const [key, value] of Object.entries(config)) {
            const configKey = `${env}:${key}`;
            this.configs.set(configKey, {
              key,
              value,
              environment: env,
              lastUpdated: new Date().toISOString()
            });
          }

          console.log(`Loaded configuration for ${env} environment`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // Create default config file if it doesn't exist
            if (env === 'default') {
              const defaultConfig = {
                "app.name": "Stage7",
                "app.version": "1.0.0",
                "log.level": "info"
              };

              await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
              console.log(`Created default configuration file at ${configPath}`);

              // Store default config items
              for (const [key, value] of Object.entries(defaultConfig)) {
                const configKey = `${env}:${key}`;
                this.configs.set(configKey, {
                  key,
                  value,
                  environment: env,
                  lastUpdated: new Date().toISOString()
                });
              }
            } else {
              console.log(`Configuration file for ${env} environment not found, skipping`);
            }
          } else {
            console.error(`Error loading configuration for ${env} environment:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error loading configurations:', error);
    }
  }

  private async saveConfiguration(environment: string) {
    try {
      // Get all config items for the specified environment
      const envConfigs: Record<string, any> = {};

      for (const [configKey, configItem] of this.configs.entries()) {
        if (configItem.environment === environment) {
          envConfigs[configItem.key] = configItem.value;
        }
      }

      // Save to file
      const configPath = path.join(this.configDir, `${environment}.json`);
      await fs.writeFile(configPath, JSON.stringify(envConfigs, null, 2));

      console.log(`Saved configuration for ${environment} environment`);
    } catch (error) {
      console.error(`Error saving configuration for ${environment} environment:`, error);
      throw error;
    }
  }

  private initializeServer() {
    this.app.use(bodyParser.json());

    // Set up health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ status: 'ok' });
    });

    // Get all configurations
    this.app.get('/config', (req, res) => {
      const environment = req.query.environment as string || 'default';
      const configs = Array.from(this.configs.values())
        .filter(config => config.environment === environment);

      res.status(200).json(configs);
    });

    // Get a specific configuration
    this.app.get('/config/:key', (req, res) => {
      const key = req.params.key;
      const environment = req.query.environment as string || 'default';
      const configKey = `${environment}:${key}`;

      if (this.configs.has(configKey)) {
        res.status(200).json(this.configs.get(configKey));
      } else {
        // Try to get from default environment if not found in specified environment
        const defaultConfigKey = `default:${key}`;

        if (this.configs.has(defaultConfigKey)) {
          res.status(200).json(this.configs.get(defaultConfigKey));
        } else {
          res.status(404).json({ error: `Configuration ${key} not found` });
        }
      }
    });

    // Set a configuration
    this.app.put('/config/:key', async (req, res) => {
      try {
        const key = req.params.key;
        const { value, description } = req.body;
        const environment = req.query.environment as string || 'default';
        const configKey = `${environment}:${key}`;

        this.configs.set(configKey, {
          key,
          value,
          environment,
          description,
          lastUpdated: new Date().toISOString()
        });

        await this.saveConfiguration(environment);

        res.status(200).json(this.configs.get(configKey));
      } catch (error) {
        analyzeError(error as Error);
        res.status(500).json({ error: 'Failed to set configuration' });
      }
    });

    // Delete a configuration
    this.app.delete('/config/:key', async (req, res) => {
      try {
        const key = req.params.key;
        const environment = req.query.environment as string || 'default';
        const configKey = `${environment}:${key}`;

        if (this.configs.has(configKey)) {
          this.configs.delete(configKey);
          await this.saveConfiguration(environment);
          res.status(200).json({ message: `Configuration ${key} deleted` });
        } else {
          res.status(404).json({ error: `Configuration ${key} not found` });
        }
      } catch (error) {
        analyzeError(error as Error);
        res.status(500).json({ error: 'Failed to delete configuration' });
      }
    });

    // Start the server
    this.app.listen(this.port, () => {
      console.log(`ConfigService is running on port ${this.port}`);
    });
  }

  // Override the setupHealthCheck method from BaseEntity
  protected setupHealthCheck() {
    // Already set up in initializeServer
  }
}

// Create an instance of the ConfigService
new ConfigService();
