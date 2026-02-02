# V2 Architecture Quick Start Guide

## For Developers: Get Started in 5 Minutes

### Prerequisites
- Node.js 18+ and npm
- Python 3.9+
- Running L1 Core Engine (MissionControl, TrafficManager, CapabilitiesManager)

## Option 1: Use an Existing Assistant (Fastest)

### 1. Start L1 Core Engine
```bash
# Terminal 1: Start MissionControl
cd services/missioncontrol
npm run dev

# Terminal 2: Start TrafficManager
cd services/trafficmanager
npm run dev

# Terminal 3: Start CapabilitiesManager
cd services/capabilitiesmanager
python src/main.py
```

### 2. Start Your Chosen Assistant API
To choose an assistant, navigate to the `agents/` directory and select one, for example, `pm-assistant-api`.

```bash
# Terminal 4: Start [assistant]-api, e.g., PM Assistant API
cd agents/[assistant]-api # e.g., cd agents/pm-assistant-api
npm install
npm run dev
```

### 3. Start React UI
```bash
# Terminal 5: Start React UI
cd services/mcsreact
npm install
npm start
```

### 4. Access Your Assistant
Open browser: `http://localhost:3000/assistants/[assistant-id]` (e.g., `http://localhost:3000/assistants/pm-assistant`)

## Option 2: Generate a New Assistant

### 1. Create Assistant Configuration
Create `configs/v2-assistants/my-assistant.json`:

```json
{
  "assistant_id": "my-assistant",
  "assistant_name": "My Assistant",
  "assistant_role": "Assists with my specific tasks",
  "assistant_personality": "Helpful and efficient",
  "port": 3016,
  "tools": [
    {"name": "MyTool", "plugin": "MY_PLUGIN", "description": "My functionality"}
  ]
}
```

### 2. Generate L1 Plugin
```bash
python scripts/generate-plugin.py MY_PLUGIN \
  "My plugin description" \
  "Detailed explanation of what this plugin does" \
  "tag1,tag2,tag3" \
  "category"
```

### 3. Implement Plugin Actions
Edit `services/capabilitiesmanager/src/plugins/MY_PLUGIN/main.py`:

```python
def my_action(payload: dict) -> dict:
    """Implement your action logic here."""
    # Your implementation
    return {"result": "success", "data": payload}

def execute_plugin(inputs):
    action = _get_input(inputs, 'action')
    payload = _get_input(inputs, 'payload', default={})
    
    if action == 'my_action':
        result_data = my_action(payload)
    else:
        return [{"success": False, "error": f"Unknown action: {action}"}]
    
    return [{"success": True, "result": result_data}]
```

### 4. Create SDK Tool
Create `sdk/src/tools/MyTool.ts`:

```typescript
import { Tool } from '../Tool';
import { ICoreEngineClient } from '../types';

export class MyTool extends Tool {
  constructor(coreEngineClient: ICoreEngineClient) {
    super({
      name: 'MyTool',
      description: 'My tool description',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          payload: { type: 'object' }
        },
        required: ['action', 'payload']
      },
      coreEngineClient
    });
  }

  public async myAction(params: any, conversationId: string): Promise<any> {
    return this.execute({ action: 'my_action', payload: params }, conversationId);
  }
}
```

Export in `sdk/src/tools/index.ts`:
```typescript
export { MyTool } from './MyTool';
```

### 5. Generate Assistant
```bash
python scripts/generate-v2-assistant.py configs/v2-assistants/my-assistant.json
```

### 6. Build and Run
```bash
cd services/my-assistant-api
npm install
npm run build
npm run dev
```

### 7. Access Your Assistant
Open browser: `http://localhost:3016/api/my-assistant`

## Option 3: Generate All 15 Assistants

### 1. Generate All Assistants
```bash
python scripts/generate-all-v2-assistants.py
```

### 2. Implement Missing Plugins
For each assistant, implement the L1 plugins that don't exist yet.

### 3. Create SDK Tools
For each assistant, create the SDK tool classes.

### 4. Build and Run Each Assistant
```bash
cd services/[assistant]-api
npm install
npm run build
npm run dev
```

## Testing Your Implementation

### Test L1 Plugin
```bash
# Test plugin directly
echo '{"action": "my_action", "payload": {"test": "data"}}' | \
  python services/capabilitiesmanager/src/plugins/MY_PLUGIN/main.py
```

### Test L2 SDK Tool
```bash
# Run SDK integration test
ts-node scripts/test-sdk-tool-integration.ts
```

### Test L3 API
(Replace `[assistant-id]` with the actual assistant ID and `[assistant-port]` with the port configured for the assistant, e.g., 3016 for `my-assistant` as per its config.)

```bash
# Start conversation
curl -X POST http://localhost:[assistant-port]/api/[assistant-id]/conversations \
  -H "Content-Type: application/json" \
  -d '{"initialPrompt": "Hello!"}'

# Send message
curl -X POST http://localhost:[assistant-port]/api/[assistant-id]/conversations/CONV_ID/messages \
  -H "Content-Type: application/json" \
  -d '{"message": "Do something"}'
```

### Test L4 UI
Open browser and interact with the UI.

## Common Issues

### Issue: "Cannot connect to L1 Core Engine"
**Solution**: Ensure MissionControl, TrafficManager, and CapabilitiesManager are running.

### Issue: "Plugin not found"
**Solution**: Check that the plugin exists in `services/capabilitiesmanager/src/plugins/` and has a valid `manifest.json`.

### Issue: "Tool not registered"
**Solution**: Ensure the tool is imported and added to the assistant's tools array in the API's `index.ts`.

### Issue: "WebSocket connection failed"
**Solution**: Check that the WebSocket server is running and the URL is correct.

## File Structure Reference

```
project/
├── configs/v2-assistants/          # Assistant configurations
├── docs/v2/                        # V2 documentation
├── scripts/                        # Generation and test scripts
├── sdk/src/                        # L2 SDK
│   ├── tools/                      # SDK tool classes
│   ├── Assistant.ts
│   ├── Conversation.ts
│   ├── Tool.ts
│   └── HttpCoreEngineClient.ts
├── services/
│   ├── capabilitiesmanager/        # L1 CapabilitiesManager
│   │   └── src/plugins/            # L1 plugins
│   ├── missioncontrol/             # L1 MissionControl
│   ├── trafficmanager/             # L1 TrafficManager
│   ├── [assistant]-api/            # L3 assistant APIs
│   └── mcsreact/                   # L4 React UI
│       └── src/assistants/         # L4 assistant components
```

## Next Steps



## Next Steps

1. **Read the Architecture**: `docs/v2/v2-architecture-overview.md`
2. **Study the Pattern**: `docs/v2/reusable-assistant-integration-pattern.md`
3. **Review an Existing Assistant**: Reference implementation examples can be found in `agents/pm-assistant-api/` or other assistant directories.
4. **Generate Your Assistant**: Use the tools to create your own
5. **Test Everything**: Use the testing scripts to verify

## Resources

- **Architecture Overview**: `docs/v2/v2-architecture-overview.md`
- **Integration Pattern**: `docs/v2/reusable-assistant-integration-pattern.md`
- **Implementation Summary**: `docs/v2/v2-assistant-implementation-summary.md`
- **Plugin Creation Guide**: `docs/v2/plugin-creation-guide.md`


## Support

For questions or issues:
1. Check the documentation in `docs/`
2. Review the PM Assistant reference implementation
3. Run the test scripts to verify your setup
4. Check the console logs for error messages

---

**Ready to build? Start with Option 1 to see it working, then move to Option 2 to create your own!**

