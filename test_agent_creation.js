const http = require('http');

// Test agent creation by calling AgentSet directly
const testData = JSON.stringify({
    agentId: 'test-agent-' + Date.now(),
    actionVerb: 'ACCOMPLISH',
    inputs: [],
    missionId: 'test-mission-' + Date.now(),
    missionContext: 'Testing agent creation after refactoring fixes'
});

const options = {
    hostname: 'localhost',
    port: 5100,
    path: '/addAgent',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(testData)
    }
};

console.log('Testing agent creation...');
console.log('Request data:', testData);

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers:`, res.headers);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('Response:', data);
        if (res.statusCode === 200) {
            console.log('✅ Agent creation test PASSED');
        } else {
            console.log('❌ Agent creation test FAILED');
        }
    });
});

req.on('error', (e) => {
    console.error('❌ Request error:', e.message);
});

req.write(testData);
req.end();
