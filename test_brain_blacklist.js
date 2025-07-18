const http = require('http');

const testData = {
    exchanges: [
        {
            role: "user",
            content: "Hello, this is a test message to trigger model selection"
        }
    ],
    optimization: "accuracy",
    conversationType: "TextToText",
    max_length: 50
};

const postData = JSON.stringify(testData);

const options = {
    hostname: 'localhost',
    port: 5070,
    path: '/chat',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
    }
};

console.log('Making request to brain service...');

const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('Response:', data);
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
