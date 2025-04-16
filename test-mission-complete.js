/**
 * Comprehensive test script to create a mission in Stage7 and monitor its execution
 */

const axios = require('axios');
const WebSocket = require('ws');

// Configuration
const CONFIG = {
    securityManagerUrl: 'http://localhost:5010',
    postOfficeUrl: 'http://localhost:5020',
    missionGoal: 'Invent a new business that can run fully automatically',
    componentType: 'MissionControl',
    clientSecret: 'stage7AuthSecret',
    monitorDuration: 5 * 60 * 1000 // 5 minutes
};

// Get authentication token
async function getAuthToken() {
    console.log('Getting authentication token...');
    
    try {
        const response = await axios.post(`${CONFIG.securityManagerUrl}/auth/service`, {
            componentType: CONFIG.componentType,
            clientSecret: CONFIG.clientSecret
        });
        
        if (response.data.authenticated && response.data.token) {
            console.log('Authentication successful!');
            return response.data.token;
        } else {
            console.error('Authentication failed:', response.data);
            return null;
        }
    } catch (error) {
        console.error('Authentication error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// Create a mission
async function createMission(token) {
    console.log('Creating mission with goal:', CONFIG.missionGoal);
    
    try {
        const response = await axios.post(`${CONFIG.postOfficeUrl}/createMission`, {
            goal: CONFIG.missionGoal,
            clientId: 'test-client-' + Date.now()
        }, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        console.log('Mission created successfully!');
        console.log('Response:', response.data);
        
        return response.data;
    } catch (error) {
        console.error('Failed to create mission:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// Connect to WebSocket to receive updates
function connectWebSocket(token) {
    if (!token) {
        console.error('No token provided for WebSocket connection');
        return null;
    }
    
    const clientId = 'test-client-' + Date.now();
    const wsUrl = `ws://localhost:5020?clientId=${clientId}&token=${token}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    const ws = new WebSocket(wsUrl);
    
    // Track mission progress
    let missionStarted = false;
    let planGenerated = false;
    let stepsExecuted = 0;
    let agentsCreated = 0;
    
    ws.on('open', () => {
        console.log('WebSocket connection established!');
    });
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            console.log(`Received message type: ${message.type}`);
            
            // Track mission progress based on message types
            if (message.type === 'missionStarted') {
                missionStarted = true;
                console.log('Mission started!');
                if (message.content && message.content.missionId) {
                    console.log(`Mission ID: ${message.content.missionId}`);
                }
            } else if (message.type === 'planGenerated' || message.type === 'plan') {
                planGenerated = true;
                console.log('Plan generated!');
                if (message.content && message.content.steps) {
                    console.log(`Plan contains ${message.content.steps.length} steps`);
                }
            } else if (message.type === 'stepCompleted' || message.type === 'stepComplete') {
                stepsExecuted++;
                console.log(`Step completed! Total steps executed: ${stepsExecuted}`);
            } else if (message.type === 'agentCreated') {
                agentsCreated++;
                console.log(`Agent created! Total agents: ${agentsCreated}`);
            } else if (message.type === 'agentStatistics') {
                console.log('Agent statistics received:');
                if (message.content) {
                    console.log(`- LLM calls: ${message.content.llmCalls || 0}`);
                    console.log(`- Agents by status: ${JSON.stringify(message.content.agentCountByStatus || {})}`);
                }
            }
            
            // Print message content
            if (message.content) {
                if (typeof message.content === 'string') {
                    console.log(`Content: ${message.content.substring(0, 100)}...`);
                } else {
                    const contentStr = JSON.stringify(message.content).substring(0, 200);
                    console.log(`Content: ${contentStr}${contentStr.length >= 200 ? '...' : ''}`);
                }
            }
        } catch (error) {
            console.log('Received raw message:', data.toString());
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
    });
    
    ws.on('close', (code, reason) => {
        console.log(`WebSocket closed: ${code} - ${reason}`);
    });
    
    // Keep the connection open
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);
    
    // Print summary after monitoring period
    setTimeout(() => {
        console.log('\n=== Mission Execution Summary ===');
        console.log(`Mission started: ${missionStarted ? 'Yes' : 'No'}`);
        console.log(`Plan generated: ${planGenerated ? 'Yes' : 'No'}`);
        console.log(`Steps executed: ${stepsExecuted}`);
        console.log(`Agents created: ${agentsCreated}`);
        
        if (missionStarted && planGenerated && stepsExecuted > 0) {
            console.log('\nMission is executing successfully!');
        } else if (missionStarted && planGenerated) {
            console.log('\nPlan was generated but no steps have been executed yet.');
        } else if (missionStarted) {
            console.log('\nMission started but no plan has been generated yet.');
        } else {
            console.log('\nMission has not started properly.');
        }
        
        console.log('\nContinuing to monitor...');
    }, CONFIG.monitorDuration);
    
    return { ws, pingInterval };
}

// Run the test
async function runTest() {
    try {
        // Get authentication token
        const token = await getAuthToken();
        if (!token) {
            console.error('Failed to get authentication token');
            process.exit(1);
        }
        
        // Connect to WebSocket
        const { ws, pingInterval } = connectWebSocket(token);
        
        // Create mission
        const missionData = await createMission(token);
        if (!missionData) {
            console.error('Failed to create mission');
            if (ws) ws.close();
            clearInterval(pingInterval);
            process.exit(1);
        }
        
        console.log('Test started successfully! Monitoring mission execution...');
        console.log('Press Ctrl+C to exit');
    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

// Run the test
runTest();
