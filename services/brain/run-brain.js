const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Create express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Brain service is running' });
});

// Models health check endpoint
app.get('/models/health', async (req, res) => {
  try {
    // Get list of model files
    const modelsDir = path.join(__dirname, 'src', 'models');
    const modelFiles = fs.readdirSync(modelsDir)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
      .filter(file => file !== 'baseModel.ts' && file !== 'baseModel.js');

    // Parse model files to extract information
    const models = [];
    const modelsByProvider = {};

    for (const file of modelFiles) {
      try {
        const content = fs.readFileSync(path.join(modelsDir, file), 'utf8');

        // Extract model name
        const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
        const name = nameMatch ? nameMatch[1] : file.replace(/\.(ts|js)$/, '');

        // Extract model provider/interface
        const interfaceMatch = content.match(/interfaceName:\s*["']([^"']+)["']/);
        const interfaceName = interfaceMatch ? interfaceMatch[1] : 'unknown';

        // Extract service name
        const serviceMatch = content.match(/serviceName:\s*["']([^"']+)["']/);
        const serviceName = serviceMatch ? serviceMatch[1] : 'unknown';

        // Extract token limit
        const tokenLimitMatch = content.match(/tokenLimit:\s*(\d+)/);
        const tokenLimit = tokenLimitMatch ? parseInt(tokenLimitMatch[1]) : 0;

        // Extract conversation types
        const conversationTypesMatch = content.match(/contentConversation:\s*\[([\s\S]*?)\]/);
        const conversationTypesStr = conversationTypesMatch ? conversationTypesMatch[1] : '';
        const conversationTypes = conversationTypesStr
          .split(',')
          .map(type => type.trim().replace(/LLMConversationType\.|["']/g, ''))
          .filter(Boolean);

        // Check if API key is set
        const apiKeyEnvVar = getApiKeyEnvVar(serviceName);
        const apiKeySet = apiKeyEnvVar ? !!process.env[apiKeyEnvVar] : false;

        // Create model object
        const model = {
          name,
          interfaceName,
          serviceName,
          tokenLimit,
          supportedConversationTypes: conversationTypes,
          apiKeySet,
          available: apiKeySet // Simplified availability check
        };

        models.push(model);

        // Group by provider
        if (!modelsByProvider[interfaceName]) {
          modelsByProvider[interfaceName] = {
            provider: interfaceName,
            totalModels: 0,
            availableModels: 0,
            unavailableModels: 0,
            models: []
          };
        }

        modelsByProvider[interfaceName].totalModels++;
        if (model.available) {
          modelsByProvider[interfaceName].availableModels++;
        } else {
          modelsByProvider[interfaceName].unavailableModels++;
        }
        modelsByProvider[interfaceName].models.push(model);
      } catch (err) {
        console.error(`Error parsing model file ${file}:`, err);
      }
    }

    // Create health report
    const healthReport = {
      totalModels: models.length,
      availableModels: models.filter(m => m.available).length,
      unavailableModels: models.filter(m => !m.available).length,
      models,
      providers: Object.values(modelsByProvider)
    };

    res.json(healthReport);
  } catch (error) {
    console.error('Error generating models health report:', error);
    res.status(500).json({ error: 'Failed to generate models health report' });
  }
});

// Get available models
app.get('/models', (req, res) => {
  try {
    // Get list of model files
    const modelsDir = path.join(__dirname, 'src', 'models');
    const modelFiles = fs.readdirSync(modelsDir)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
      .filter(file => file !== 'baseModel.ts' && file !== 'baseModel.js');

    // Extract model names
    const modelNames = modelFiles.map(file => {
      const content = fs.readFileSync(path.join(modelsDir, file), 'utf8');
      const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
      return nameMatch ? nameMatch[1] : file.replace(/\.(ts|js)$/, '');
    });

    res.json({ models: modelNames });
  } catch (error) {
    console.error('Error getting models:', error);
    res.status(500).json({ error: 'Failed to get models' });
  }
});

// LLM calls endpoint - returns 0 since this is just a minimal runner
app.get('/getLLMCalls', (req, res) => {
  res.json({ llmCalls: 0 });
});

// Chat endpoint - returns a helpful message directing users to use the actual Brain service
app.post('/chat', (req, res) => {
  const { exchanges } = req.body;

  if (!exchanges || !exchanges.length) {
    return res.status(400).json({ error: 'No exchanges provided' });
  }

  // Informational response
  const response = {
    response: 'This is the minimal Brain runner. Please use the actual Brain service for LLM interactions.',
    mimeType: 'text/plain'
  };

  return res.json(response);
});

// Helper function to get API key environment variable name based on service name
function getApiKeyEnvVar(serviceName) {
  const serviceToEnvMap = {
    'OAService': 'OPENAI_API_KEY',
    'OWService': 'OPENWEBUI_API_KEY',
    'ANTService': 'ANTHROPIC_API_KEY',
    'HFService': 'HUGGINGFACE_API_KEY',
    'GGService': 'GOOGLE_API_KEY',
    'ORService': 'OPENROUTER_API_KEY'
  };

  return serviceToEnvMap[serviceName];
}

// Start the server
const port = process.env.PORT || 5070;
app.listen(port, '0.0.0.0', () => {
  console.log(`Brain service listening at http://0.0.0.0:${port}`);
});
