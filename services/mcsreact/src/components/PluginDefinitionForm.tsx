import React, { useState, useEffect } from 'react';
import {
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  Typography,
  Divider,
  IconButton,
  Alert,
  Switch,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Paper,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import {
  PluginManifest,
} from './../shared-browser/PluginManifest'; // Assuming these types are available from shared
import {
  DefinitionManifest,
  DefinitionType,
} from './../shared-browser/DefinitionManifest'; 
import {
  OpenAPITool,
  OpenAPIActionMapping,
  OpenAPIAuthentication,
} from './../shared-browser/OpenAPITool'; 
import {
  MCPTool,
  MCPActionMapping,
  MCPAuthentication,
} from './../shared-browser/MCPTool'; 

interface PluginDefinitionFormProps {
  initialPlugin?: PluginManifest | DefinitionManifest;
  onSubmit: (plugin: PluginManifest | DefinitionManifest) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

const initialPluginManifest: PluginManifest = {
  id: '',
  verb: '',
  version: '1.0.0',
  language: 'javascript', // Default to javascript
  description: '',
  inputDefinitions: [],
  outputDefinitions: [],
  repository: { type: 'mongo' }, // Default to mongo
  security: { permissions: [], sandboxOptions: { allowEval: false, timeout: 5000, memory: 128, allowedModules: [], allowedAPIs: [] }, trust: {} },
};

const initialOpenAPITool: OpenAPITool = {
  id: '',
  name: '',
  description: '',
  version: '1.0.0',
  specUrl: '',
  specVersion: '3.0',
  baseUrl: '',
  authentication: {
    type: 'none',
    apiKey: { in: 'header', name: '', credentialSource: '' },
    bearer: { credentialSource: '' },
  },
  actionMappings: [],
  metadata: { author: '', created: new Date(), tags: [], category: '' },
};

const initialMCPTool: MCPTool = {
  id: '',
  name: '',
  description: '',
  version: '1.0.0',
  authentication: {
    type: 'none',
    apiKey: { in: 'header', name: '', credentialSource: '' },
    customToken: { headerName: '', credentialSource: '' },
  },
  actionMappings: [],
  metadata: { author: '', created: new Date().toISOString(), tags: [], category: '' },
};

const PluginDefinitionForm: React.FC<PluginDefinitionFormProps> = ({
  initialPlugin,
  onSubmit,
  onCancel,
  loading,
  error,
}) => {
  const [plugin, setPlugin] = useState<PluginManifest | DefinitionManifest>(
    initialPlugin || initialPluginManifest
  );
  const [openAPITool, setOpenAPITool] = useState<OpenAPITool>(initialOpenAPITool);
  const [mcpTool, setMcpTool] = useState<MCPTool>(initialMCPTool);
  const [validationErrors, setValidationErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    if (initialPlugin) {
      setPlugin(initialPlugin);
      if (
        (initialPlugin as DefinitionManifest).definitionType === DefinitionType.OPENAPI &&
        (initialPlugin as DefinitionManifest).toolDefinition
      ) {
        setOpenAPITool((initialPlugin as DefinitionManifest).toolDefinition as OpenAPITool);
      } else if (
        (initialPlugin as DefinitionManifest).definitionType === DefinitionType.MCP &&
        (initialPlugin as DefinitionManifest).toolDefinition
      ) {
        setMcpTool((initialPlugin as DefinitionManifest).toolDefinition as MCPTool);
      }
    }
  }, [initialPlugin]);

  const isDefinitionManifest = (p: PluginManifest | DefinitionManifest): p is DefinitionManifest => {
    return (p as DefinitionManifest).definitionType !== undefined;
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    let isValid = true;

    // Basic PluginManifest validation
    if (!plugin.id) { errors.id = 'Plugin ID is required'; isValid = false; }
    if (!plugin.verb) { errors.verb = 'Action Verb is required'; isValid = false; }
    if (!plugin.version) { errors.version = 'Version is required'; isValid = false; }
    if (!plugin.description) { errors.description = 'Description is required'; isValid = false; }

    if (plugin.language === DefinitionType.OPENAPI) {
      if (!openAPITool.id) { errors['openAPITool.id'] = 'OpenAPI Tool ID is required'; isValid = false; }
      if (!openAPITool.name) { errors['openAPITool.name'] = 'OpenAPI Tool Name is required'; isValid = false; }
      if (!openAPITool.specUrl) { errors['openAPITool.specUrl'] = 'OpenAPI Spec URL is required'; isValid = false; }
      if (!openAPITool.baseUrl) { errors['openAPITool.baseUrl'] = 'Base URL is required'; isValid = false; }
      if (openAPITool.actionMappings.length === 0) { errors['openAPITool.actionMappings'] = 'At least one action mapping is required'; isValid = false; }
      openAPITool.actionMappings.forEach((mapping, index) => {
        if (!mapping.actionVerb) { errors[`openAPITool.actionMappings[${index}].actionVerb`] = 'Action Verb is required'; isValid = false; }
        if (!mapping.operationId) { errors[`openAPITool.actionMappings[${index}].operationId`] = 'Operation ID is required'; isValid = false; }
        if (!mapping.path) { errors[`openAPITool.actionMappings[${index}].path`] = 'Path is required'; isValid = false; }
        // Validate JSON inputs/outputs
        try { JSON.parse(JSON.stringify(mapping.inputs)); } catch { errors[`openAPITool.actionMappings[${index}].inputs`] = 'Invalid JSON'; isValid = false; }
        try { JSON.parse(JSON.stringify(mapping.outputs)); } catch { errors[`openAPITool.actionMappings[${index}].outputs`] = 'Invalid JSON'; isValid = false; }
      });
    } else if (plugin.language === DefinitionType.MCP) {
      if (!mcpTool.id) { errors['mcpTool.id'] = 'MCP Tool ID is required'; isValid = false; }
      if (!mcpTool.name) { errors['mcpTool.name'] = 'MCP Tool Name is required'; isValid = false; }
      if (mcpTool.actionMappings.length === 0) { errors['mcpTool.actionMappings'] = 'At least one action mapping is required'; isValid = false; }
      mcpTool.actionMappings.forEach((mapping, index) => {
        if (!mapping.actionVerb) { errors[`mcpTool.actionMappings[${index}].actionVerb`] = 'Action Verb is required'; isValid = false; }
        if (!mapping.mcpServiceTarget.serviceName) { errors[`mcpTool.actionMappings[${index}].mcpServiceTarget.serviceName`] = 'Service Name is required'; isValid = false; }
        if (!mapping.mcpServiceTarget.endpointOrCommand) { errors[`mcpTool.actionMappings[${index}].mcpServiceTarget.endpointOrCommand`] = 'Endpoint or Command is required'; isValid = false; }
        // Validate JSON inputs/outputs
        try { JSON.parse(JSON.stringify(mapping.inputs)); } catch { errors[`mcpTool.actionMappings[${index}].inputs`] = 'Invalid JSON'; isValid = false; }
        try { JSON.parse(JSON.stringify(mapping.outputs)); } catch { errors[`mcpTool.actionMappings[${index}].outputs`] = 'Invalid JSON'; isValid = false; }
      });
    }

    setValidationErrors(errors);
    return isValid;
  };

  const handleManifestChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPlugin((prev) => ({ ...prev, [name]: value }));
    setValidationErrors((prev) => ({ ...prev, [name]: undefined })); // Clear error on change
  };

  const handleLanguageChange = (e: SelectChangeEvent<string>) => {
    const newLanguage = e.target.value;
    setPlugin((prev) => ({ ...prev, language: newLanguage }));
    if (newLanguage === DefinitionType.OPENAPI) {
      setOpenAPITool(initialOpenAPITool);
    } else if (newLanguage === DefinitionType.MCP) {
      setMcpTool(initialMCPTool);
    }
    setValidationErrors({}); // Clear all errors when language changes
  };

  const handleOpenAPIToolChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setOpenAPITool((prev) => ({ ...prev, [name]: value }));
    setValidationErrors((prev) => ({ ...prev, [`openAPITool.${name}`]: undefined })); // Clear error on change
  };

  const handleMCPToolChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setMcpTool((prev) => ({ ...prev, [name]: value }));
    setValidationErrors((prev) => ({ ...prev, [`mcpTool.${name}`]: undefined })); // Clear error on change
  };

  const handleOpenAPIAuthChange = (e: SelectChangeEvent<string>) => {
    const type = e.target.value as OpenAPIAuthentication['type'];
    let newAuth: OpenAPIAuthentication;
    if (type === 'apiKey') {
      newAuth = { type, apiKey: { in: 'header', name: '', credentialSource: '' } };
    } else if (type === 'bearer') {
      newAuth = { type, bearer: { credentialSource: '' } };
    } else {
      newAuth = { type: 'none' };
    }
    setOpenAPITool((prev) => ({ ...prev, authentication: newAuth }));
  };

  const handleMCPAuthChange = (e: SelectChangeEvent<string>) => {
    const type = e.target.value as MCPAuthentication['type'];
    let newAuth: MCPAuthentication;
    if (type === 'apiKey') {
      newAuth = { type, apiKey: { in: 'header', name: '', credentialSource: '' } };
    } else if (type === 'customToken') {
      newAuth = { type, customToken: { headerName: '', credentialSource: '' } };
    } else {
      newAuth = { type: 'none' };
    }
    setMcpTool((prev) => ({ ...prev, authentication: newAuth }));
  };

  const handleCredentialSourceChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>, toolType: 'openapi' | 'mcp') => {
    const { value } = e.target;
    if (toolType === 'openapi') {
      setOpenAPITool((prev) => {
        const newAuth = { ...prev.authentication };
        if (newAuth.type === 'apiKey') {
          newAuth.apiKey = { ...newAuth.apiKey, credentialSource: value, in: newAuth.apiKey?.in || 'header', name: newAuth.apiKey?.name || '' };
        } else if (newAuth.type === 'bearer') {
          newAuth.bearer = { ...newAuth.bearer, credentialSource: value };
        }
        return { ...prev, authentication: newAuth };
      });
    } else { // mcp
      setMcpTool((prev) => {
        const newAuth = { ...prev.authentication, type: prev.authentication?.type || 'none' }; // Ensure type is always a string
        if (newAuth.type === 'apiKey') {
          newAuth.apiKey = { ...newAuth.apiKey, credentialSource: value, in: newAuth.apiKey?.in || 'header', name: newAuth.apiKey?.name || '' };
        } else if (newAuth.type === 'customToken') {
          newAuth.customToken = { ...newAuth.customToken, headerName: '', credentialSource: value };
        }
        return { ...prev, authentication: newAuth };
      });
    }
  };

  const handleAddActionMapping = (toolType: 'openapi' | 'mcp') => {
    if (toolType === 'openapi') {
      setOpenAPITool((prev) => ({
        ...prev,
        actionMappings: [
          ...prev.actionMappings,
          {
            actionVerb: '',
            operationId: '',
            method: 'GET',
            path: '',
            inputs: [],
            outputs: [],
          } as OpenAPIActionMapping,
        ],
      }));
    } else { // mcp
      setMcpTool((prev) => ({
        ...prev,
        actionMappings: [
          ...prev.actionMappings,
          {
            actionVerb: '',
            mcpServiceTarget: { serviceName: '', endpointOrCommand: '', method: 'GET' },
            inputs: [],
            outputs: [],
          } as MCPActionMapping,
        ],
      }));
    }
    setValidationErrors((prev) => ({ ...prev, [`${toolType}.actionMappings`]: undefined })); // Clear collection error
  };

  const handleRemoveActionMapping = (index: number, toolType: 'openapi' | 'mcp') => {
    if (toolType === 'openapi') {
      setOpenAPITool((prev) => ({
        ...prev,
        actionMappings: prev.actionMappings.filter((_, i) => i !== index),
      }));
    } else { // mcp
      setMcpTool((prev) => ({
        ...prev,
        actionMappings: prev.actionMappings.filter((_, i) => i !== index),
      }));
    }
  };

  const handleActionMappingChange = (
    index: number,
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    toolType: 'openapi' | 'mcp'
  ) => {
    const { name, value } = e.target;
    if (toolType === 'openapi') {
      const updatedMappings = [...openAPITool.actionMappings];
      (updatedMappings[index] as any)[name] = value;
      setOpenAPITool((prev) => ({ ...prev, actionMappings: updatedMappings }));
      setValidationErrors((prev) => ({ ...prev, [`openAPITool.actionMappings[${index}].${name}`]: undefined }));
    } else { // mcp
      const updatedMappings = [...mcpTool.actionMappings];
      if (name.startsWith('mcpServiceTarget.')) {
        const targetField = name.split('.')[1];
        (updatedMappings[index].mcpServiceTarget as any)[targetField] = value;
        setMcpTool((prev) => ({ ...prev, actionMappings: updatedMappings }));
        setValidationErrors((prev) => ({ ...prev, [`mcpTool.actionMappings[${index}].mcpServiceTarget.${targetField}`]: undefined }));
      } else {
        (updatedMappings[index] as any)[name] = value;
        setMcpTool((prev) => ({ ...prev, actionMappings: updatedMappings }));
        setValidationErrors((prev) => ({ ...prev, [`mcpTool.actionMappings[${index}].${name}`]: undefined }));
      }
    }
  };

  const handleSubmit = () => {
    if (!validateForm()) {
      console.error('Form has validation errors.', validationErrors);
      return;
    }

    let finalPlugin: PluginManifest | DefinitionManifest;

    if (plugin.language === DefinitionType.OPENAPI) {
      finalPlugin = {
        ...plugin,
        definitionType: DefinitionType.OPENAPI,
        toolDefinition: openAPITool,
        primaryActionVerb: openAPITool.actionMappings[0]?.actionVerb || '', // Use first actionVerb as primary
      } as DefinitionManifest;
    } else if (plugin.language === DefinitionType.MCP) {
      finalPlugin = {
        ...plugin,
        definitionType: DefinitionType.MCP,
        toolDefinition: mcpTool,
        primaryActionVerb: mcpTool.actionMappings[0]?.actionVerb || '', // Use first actionVerb as primary
      } as DefinitionManifest;
    } else {
      finalPlugin = plugin;
    }
    onSubmit(finalPlugin);
  };

  const renderAuthenticationFields = (auth: OpenAPIAuthentication | MCPAuthentication | undefined, toolType: 'openapi' | 'mcp') => {
    // Provide a default authentication object if auth is undefined
    const effectiveAuth = auth || { type: 'none' };
    const handleAuthTypeChange = toolType === 'openapi' ? handleOpenAPIAuthChange : handleMCPAuthChange;
    const currentAuthType = effectiveAuth.type;

    return (
      <Box sx={{ mt: 2, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
        <Typography variant="subtitle1" gutterBottom>Authentication</Typography>
        <FormControl fullWidth margin="normal">
          <InputLabel>Auth Type</InputLabel>
          <Select value={currentAuthType} onChange={handleAuthTypeChange} label="Auth Type">
            <MenuItem value="none">None</MenuItem>
            <MenuItem value="apiKey">API Key</MenuItem>
            <MenuItem value="bearer">Bearer Token</MenuItem>
            {toolType === 'mcp' && <MenuItem value="customToken">Custom Token</MenuItem>}
            {/* Add other auth types as needed */}
          </Select>
        </FormControl>
        {currentAuthType !== 'none' && (
          <TextField
            label="Credential Source (Environment Variable Name)"
            name="credentialSource"
            fullWidth
            margin="normal"
            value={
              (currentAuthType === 'apiKey' && (effectiveAuth as OpenAPIAuthentication).apiKey?.credentialSource) ||
              (currentAuthType === 'bearer' && (effectiveAuth as OpenAPIAuthentication).bearer?.credentialSource) ||
              (currentAuthType === 'customToken' && (effectiveAuth as MCPAuthentication).customToken?.credentialSource) ||
              ''
            }
            onChange={(e) => handleCredentialSourceChange(e, toolType)}
            helperText="Name of the environment variable holding the secret (e.g., RESEND_API_KEY)"
          />
        )}
        {/* Add more specific fields for other auth types if necessary */}
      </Box>
    );
  };

  const renderActionMappings = (toolType: 'openapi' | 'mcp') => {
    const mappings = toolType === 'openapi' ? openAPITool.actionMappings : mcpTool.actionMappings;
    const handleAdd = () => handleAddActionMapping(toolType);
    const handleRemove = (index: number) => handleRemoveActionMapping(index, toolType);
    const handleChange = (index: number, e: any) => handleActionMappingChange(index, e, toolType);

    return (
      <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
        <Typography variant="h6" gutterBottom>Action Mappings</Typography>
        {mappings.map((mapping, index) => (
          <Paper key={index} elevation={1} sx={{ p: 2, mb: 2, position: 'relative' }}>
            <IconButton
              aria-label="delete"
              size="small"
              onClick={() => handleRemove(index)}
              sx={{ position: 'absolute', top: 8, right: 8 }}
            >
              <DeleteIcon />
            </IconButton>
            <TextField
              label="Action Verb"
              name="actionVerb"
              fullWidth
              margin="normal"
              value={mapping.actionVerb}
              onChange={(e) => handleChange(index, e)}
              error={!!validationErrors[`${toolType}.actionMappings[${index}].actionVerb`]}
              helperText={validationErrors[`${toolType}.actionMappings[${index}].actionVerb`]}
            />
            {toolType === 'openapi' && (
              <>
                <TextField
                  label="Operation ID (from OpenAPI Spec)"
                  name="operationId"
                  fullWidth
                  margin="normal"
                  value={(mapping as OpenAPIActionMapping).operationId}
                  onChange={(e) => handleChange(index, e)}
                  error={!!validationErrors[`${toolType}.actionMappings[${index}].operationId`]}
                  helperText={validationErrors[`${toolType}.actionMappings[${index}].operationId`]}
                />
                <FormControl fullWidth margin="normal" error={!!validationErrors[`${toolType}.actionMappings[${index}].method`]}>
                  <InputLabel>Method</InputLabel>
                  <Select
                    name="method"
                    value={(mapping as OpenAPIActionMapping).method}
                    onChange={(e) => handleChange(index, e)}
                    label="Method"
                  >
                    <MenuItem value="GET">GET</MenuItem>
                    <MenuItem value="POST">POST</MenuItem>
                    <MenuItem value="PUT">PUT</MenuItem>
                    <MenuItem value="DELETE">DELETE</MenuItem>
                    <MenuItem value="PATCH">PATCH</MenuItem>
                  </Select>
                  {validationErrors[`${toolType}.actionMappings[${index}].method`] && (
                    <Typography color="error" variant="caption">{validationErrors[`${toolType}.actionMappings[${index}].method`]}</Typography>
                  )}
                </FormControl>
                <TextField
                  label="Path"
                  name="path"
                  fullWidth
                  margin="normal"
                  value={(mapping as OpenAPIActionMapping).path}
                  onChange={(e) => handleChange(index, e)}
                  error={!!validationErrors[`${toolType}.actionMappings[${index}].path`]}
                  helperText={validationErrors[`${toolType}.actionMappings[${index}].path`]}
                />
              </>
            )}
            {toolType === 'mcp' && (
              <>
                <TextField
                  label="Service Name"
                  name="mcpServiceTarget.serviceName"
                  fullWidth
                  margin="normal"
                  value={(mapping as MCPActionMapping).mcpServiceTarget.serviceName}
                  onChange={(e) => handleChange(index, e)}
                  error={!!validationErrors[`${toolType}.actionMappings[${index}].mcpServiceTarget.serviceName`]}
                  helperText={validationErrors[`${toolType}.actionMappings[${index}].mcpServiceTarget.serviceName`]}
                />
                <TextField
                  label="Endpoint or Command"
                  name="mcpServiceTarget.endpointOrCommand"
                  fullWidth
                  margin="normal"
                  value={(mapping as MCPActionMapping).mcpServiceTarget.endpointOrCommand}
                  onChange={(e) => handleChange(index, e)}
                  error={!!validationErrors[`${toolType}.actionMappings[${index}].mcpServiceTarget.endpointOrCommand`]}
                  helperText={validationErrors[`${toolType}.actionMappings[${index}].mcpServiceTarget.endpointOrCommand`]}
                />
                <FormControl fullWidth margin="normal" error={!!validationErrors[`${toolType}.actionMappings[${index}].mcpServiceTarget.method`]}>
                  <InputLabel>Method</InputLabel>
                  <Select
                    name="mcpServiceTarget.method"
                    value={(mapping as MCPActionMapping).mcpServiceTarget.method}
                    onChange={(e) => handleChange(index, e)}
                    label="Method"
                  >
                    <MenuItem value="GET">GET</MenuItem>
                    <MenuItem value="POST">POST</MenuItem>
                    <MenuItem value="PUT">PUT</MenuItem>
                    <MenuItem value="DELETE">DELETE</MenuItem>
                    <MenuItem value="PATCH">PATCH</MenuItem>
                    <MenuItem value="RPC">RPC</MenuItem>
                    <MenuItem value="MESSAGE_QUEUE">MESSAGE_QUEUE</MenuItem>
                  </Select>
                  {validationErrors[`${toolType}.actionMappings[${index}].mcpServiceTarget.method`] && (
                    <Typography color="error" variant="caption">{validationErrors[`${toolType}.actionMappings[${index}].mcpServiceTarget.method`]}</Typography>
                  )}
                </FormControl>
              </>
            )}
            {/* Input/Output Definitions for Action Mapping (simplified for now) */}
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Inputs (JSON Array)</Typography>
            <TextField
              label="Input Definitions (JSON Array)"
              fullWidth
              multiline
              rows={2}
              margin="normal"
              value={JSON.stringify(mapping.inputs, null, 2)}
              onChange={(e) => {
                try {
                  const updatedMappings = [...mappings];
                  updatedMappings[index].inputs = JSON.parse(e.target.value);
                  if (toolType === 'openapi') setOpenAPITool((prev) => ({ ...prev, actionMappings: updatedMappings as OpenAPIActionMapping[] }));
                  else setMcpTool((prev) => ({ ...prev, actionMappings: updatedMappings as MCPActionMapping[] }));
                  setValidationErrors((prev) => ({ ...prev, [`${toolType}.actionMappings[${index}].inputs`]: undefined }));
                } catch (err) {
                  setValidationErrors((prev) => ({ ...prev, [`${toolType}.actionMappings[${index}].inputs`]: 'Invalid JSON' }));
                  console.error("Invalid JSON for inputs", err);
                }
              }}
              error={!!validationErrors[`${toolType}.actionMappings[${index}].inputs`]}
              helperText={validationErrors[`${toolType}.actionMappings[${index}].inputs`]}
            />
            <Typography variant="subtitle2" sx={{ mt: 2 }}>Outputs (JSON Array)</Typography>
            <TextField
              label="Output Definitions (JSON Array)"
              fullWidth
              multiline
              rows={2}
              margin="normal"
              value={JSON.stringify(mapping.outputs, null, 2)}
              onChange={(e) => {
                try {
                  const updatedMappings = [...mappings];
                  updatedMappings[index].outputs = JSON.parse(e.target.value);
                  if (toolType === 'openapi') setOpenAPITool((prev) => ({ ...prev, actionMappings: updatedMappings as OpenAPIActionMapping[] }));
                  else setMcpTool((prev) => ({ ...prev, actionMappings: updatedMappings as MCPActionMapping[] }));
                  setValidationErrors((prev) => ({ ...prev, [`${toolType}.actionMappings[${index}].outputs`]: undefined }));
                } catch (err) {
                  setValidationErrors((prev) => ({ ...prev, [`${toolType}.actionMappings[${index}].outputs`]: 'Invalid JSON' }));
                  console.error("Invalid JSON for outputs", err);
                }
              }}
              error={!!validationErrors[`${toolType}.actionMappings[${index}].outputs`]}
              helperText={validationErrors[`${toolType}.actionMappings[${index}].outputs`]}
            />
          </Paper>
        ))}
        <Button startIcon={<AddIcon />} onClick={handleAdd} variant="outlined" sx={{ mt: 2 }}>
          Add Action Mapping
        </Button>
        {validationErrors[`${toolType}.actionMappings`] && (
          <Typography color="error" variant="caption" sx={{ mt: 1, display: 'block' }}>
            {validationErrors[`${toolType}.actionMappings`]}
          </Typography>
        )}
      </Box>
    );
  };

  const renderContainerFields = () => {
    // Assuming container config is part of entryPoint or packageSource
    // For simplicity, let's add some basic fields here.
    // In a real scenario, this would be more complex, potentially with nested objects.
    return (
      <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
        <Typography variant="h6" gutterBottom>Container Configuration</Typography>
        <TextField
          label="Dockerfile Path (relative to build context)"
          name="entryPoint.dockerfile" // Assuming entryPoint has dockerfile
          fullWidth
          margin="normal"
          value={(plugin.entryPoint as any)?.dockerfile || ''}
          onChange={(e) => setPlugin((prev) => ({
            ...prev,
            entryPoint: { ...(prev.entryPoint as any), dockerfile: e.target.value }
          }))}
        />
        <TextField
          label="Build Context Path (relative to repo root)"
          name="packageSource.buildContext" // Assuming packageSource has buildContext
          fullWidth
          margin="normal"
          value={(plugin.packageSource as any)?.buildContext || ''}
          onChange={(e) => setPlugin((prev) => ({
            ...prev,
            packageSource: { ...(prev.packageSource as any), buildContext: e.target.value }
          }))}
        />
        <TextField
          label="Image Name"
          name="packageSource.image" // Assuming packageSource has image
          fullWidth
          margin="normal"
          value={(plugin.packageSource as any)?.image || ''}
          onChange={(e) => setPlugin((prev) => ({
            ...prev,
            packageSource: { ...(prev.packageSource as any), image: e.target.value }
          }))}
        />
        <TextField
          label="Ports (comma-separated)"
          name="entryPoint.ports" // Assuming entryPoint has ports
          fullWidth
          margin="normal"
          value={((plugin.entryPoint as any)?.ports || []).join(',')}
          onChange={(e) => setPlugin((prev) => ({
            ...prev,
            entryPoint: { ...(prev.entryPoint as any), ports: e.target.value.split(',').map(p => p.trim()) }
          }))}
          helperText="e.g., 8080, 5000"
        />
        {/* Add health check, API endpoint for container if needed */}
      </Box>
    );
  };


  return (
    <Box component="form" sx={{ '& .MuiTextField-root': { mb: 2 }, p: 3 }} noValidate autoComplete="off">
      <Typography variant="h5" gutterBottom>
        {initialPlugin ? 'Edit Plugin Definition' : 'Add New Plugin Definition'}
      </Typography>
      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Basic Plugin Manifest Fields */}
      <TextField
        label="Plugin ID"
        name="id"
        fullWidth
        value={plugin.id}
        onChange={handleManifestChange}
        disabled={!!initialPlugin} // Disable ID editing for existing plugins
        error={!!validationErrors.id}
        helperText={validationErrors.id}
      />
      <TextField
        label="Plugin Name (for display)"
        name="name"
        fullWidth
        value={(plugin as any).name || ''} // Assuming name might be on PluginManifest
        onChange={handleManifestChange}
        error={!!validationErrors.name}
        helperText={validationErrors.name}
      />
      <TextField
        label="Version"
        name="version"
        fullWidth
        value={plugin.version}
        onChange={handleManifestChange}
        error={!!validationErrors.version}
        helperText={validationErrors.version}
      />
      <TextField
        label="Description"
        name="description"
        fullWidth
        multiline
        rows={3}
        value={plugin.description}
        onChange={handleManifestChange}
        error={!!validationErrors.description}
        helperText={validationErrors.description}
      />

      <FormControl fullWidth margin="normal">
        <InputLabel>Language/Type</InputLabel>
        <Select value={plugin.language} onChange={handleLanguageChange} label="Language/Type">
          <MenuItem value="javascript">JavaScript</MenuItem>
          <MenuItem value="python">Python</MenuItem>
          <MenuItem value="container">Container</MenuItem>
          <MenuItem value={DefinitionType.OPENAPI}>OpenAPI Tool</MenuItem>
          <MenuItem value={DefinitionType.MCP}>MCP Tool</MenuItem>
        </Select>
      </FormControl>

      {/* Dynamic Fields based on Language/Type */}
      {plugin.language === DefinitionType.OPENAPI && (
        <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
          <Typography variant="h6" gutterBottom>OpenAPI Tool Details</Typography>
          <TextField
            label="OpenAPI Tool ID"
            name="id"
            fullWidth
            value={openAPITool.id}
            onChange={handleOpenAPIToolChange}
            disabled={!!initialPlugin}
            error={!!validationErrors['openAPITool.id']}
            helperText={validationErrors['openAPITool.id']}
          />
          <TextField
            label="OpenAPI Tool Name"
            name="name"
            fullWidth
            value={openAPITool.name}
            onChange={handleOpenAPIToolChange}
            error={!!validationErrors['openAPITool.name']}
            helperText={validationErrors['openAPITool.name']}
          />
          <TextField
            label="OpenAPI Spec URL"
            name="specUrl"
            fullWidth
            value={openAPITool.specUrl}
            onChange={handleOpenAPIToolChange}
            helperText={validationErrors['openAPITool.specUrl'] || "URL to the raw OpenAPI (Swagger) JSON/YAML specification file."}
            error={!!validationErrors['openAPITool.specUrl']}
          />
          <TextField
            label="Base URL for API Calls"
            name="baseUrl"
            fullWidth
            value={openAPITool.baseUrl}
            onChange={handleOpenAPIToolChange}
            helperText={validationErrors['openAPITool.baseUrl'] || "e.g., https://api.example.com"}
            error={!!validationErrors['openAPITool.baseUrl']}
          />
          {renderAuthenticationFields(openAPITool.authentication, 'openapi')}
          {renderActionMappings('openapi')}
        </Box>
      )}

      {plugin.language === DefinitionType.MCP && (
        <Box sx={{ mt: 3, p: 2, border: '1px solid #ccc', borderRadius: '4px' }}>
          <Typography variant="h6" gutterBottom>MCP Tool Details</Typography>
          <TextField
            label="MCP Tool ID"
            name="id"
            fullWidth
            value={mcpTool.id}
            onChange={handleMCPToolChange}
            disabled={!!initialPlugin}
            error={!!validationErrors['mcpTool.id']}
            helperText={validationErrors['mcpTool.id']}
          />
          <TextField
            label="MCP Tool Name"
            name="name"
            fullWidth
            value={mcpTool.name}
            onChange={handleMCPToolChange}
            error={!!validationErrors['mcpTool.name']}
            helperText={validationErrors['mcpTool.name']}
          />
          {renderAuthenticationFields(mcpTool.authentication, 'mcp')}
          {renderActionMappings('mcp')}
        </Box>
      )}

      {plugin.language === 'container' && renderContainerFields()}

      {/* Submit and Cancel Buttons */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button variant="outlined" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading || Object.keys(validationErrors).some(key => validationErrors[key] !== undefined)}>
          {loading ? 'Saving...' : (initialPlugin ? 'Save Changes' : 'Add Plugin')}
        </Button>
      </Box>
    </Box>
  );
};

export default PluginDefinitionForm;
