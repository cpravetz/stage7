const axios = require('axios');

async function testValidationEnhancement() {
    try {
        console.log('Testing enhanced validation in ACCOMPLISH plugin...');
        
        const response = await axios.post('http://localhost:5070/chat', {
            exchanges: [
                {
                    role: 'user',
                    content: 'Create a plan to analyze some data and generate a report. Make sure to include proper steps with valid action verbs.'
                }
            ],
            optimization: 'accuracy',
            conversationType: 'TextToCode'  // This should trigger ACCOMPLISH plugin
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 45000
        });

        console.log('Status:', response.status);
        console.log('Model used:', response.data.model);
        
        // Try to parse the result as JSON to verify it's valid
        if (response.data.result) {
            try {
                const parsed = JSON.parse(response.data.result);
                console.log('✅ JSON parsing successful!');
                
                if (parsed.type === 'PLAN' && parsed.plan) {
                    console.log(`✅ Plan created with ${parsed.plan.length} steps`);
                    
                    // Check each step for valid action verbs
                    parsed.plan.forEach((step, index) => {
                        console.log(`Step ${index + 1}: ${step.actionVerb} - ${step.description.substring(0, 60)}...`);
                        
                        // Check for invalid action verbs that should have been caught
                        const invalidVerbs = ['IF', 'MONITOR', 'LOOP', 'WHEN', 'THEN'];
                        if (invalidVerbs.includes(step.actionVerb)) {
                            console.log(`❌ Found invalid action verb: ${step.actionVerb}`);
                        }
                        
                        // Check for ACCOMPLISH steps with empty goals
                        if (step.actionVerb === 'ACCOMPLISH') {
                            const hasGoal = step.inputReferences && step.inputReferences.goal && 
                                          step.inputReferences.goal.value && 
                                          step.inputReferences.goal.value.trim() !== '';
                            if (!hasGoal) {
                                console.log(`❌ ACCOMPLISH step ${index + 1} has empty or missing goal`);
                            } else {
                                console.log(`✅ ACCOMPLISH step ${index + 1} has valid goal: ${step.inputReferences.goal.value.substring(0, 40)}...`);
                            }
                        }
                        
                        // Check for malformed input references
                        if (step.inputReferences) {
                            Object.entries(step.inputReferences).forEach(([inputName, inputRef]) => {
                                if (inputRef.value && typeof inputRef.value === 'string' && 
                                    inputRef.value.startsWith("{'") && inputRef.value.endsWith("'}")) {
                                    console.log(`❌ Found malformed input reference in step ${index + 1}, input '${inputName}': ${inputRef.value}`);
                                }
                            });
                        }
                    });
                } else {
                    console.log('Response is not a plan format');
                }
            } catch (parseError) {
                console.log('❌ JSON parsing failed:', parseError.message);
                console.log('Raw response:', response.data.result.substring(0, 200) + '...');
            }
        }
        
    } catch (error) {
        console.log('Status:', error.response?.status || 'No status');
        console.log('Error Response:', error.response?.data || error.message);
    }
}

testValidationEnhancement();
