// MongoDB initialization script
// This script initializes MongoDB with default data for the Stage7 system

// Connect to MongoDB
const { MongoClient } = require('mongodb');

async function initializeMongoData() {
  const uri = 'mongodb://mongo:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    // Get database
    const db = client.db('librarianDB');

    // Initialize agent_specializations collection
    const agentSpecializationsCollection = db.collection('agent_specializations');
    
    // Check if collection is empty
    const agentSpecCount = await agentSpecializationsCollection.countDocuments();
    if (agentSpecCount === 0) {
      console.log('Initializing agent_specializations collection');
      
      // Insert default agent specializations
      await agentSpecializationsCollection.insertMany([
        {
          agentId: 'default_executor',
          roleId: 'executor',
          proficiency: 50,
          assignedAt: new Date().toISOString(),
          performance: {
            successRate: 0,
            taskCount: 0,
            averageTaskDuration: 0,
            lastEvaluation: new Date().toISOString()
          }
        }
      ]);
      
      console.log('Agent specializations initialized');
    } else {
      console.log('Agent specializations collection already has data');
    }

    // Initialize knowledge_domains collection
    const knowledgeDomainsCollection = db.collection('knowledge_domains');
    
    // Check if collection is empty
    const knowledgeDomainCount = await knowledgeDomainsCollection.countDocuments();
    if (knowledgeDomainCount === 0) {
      console.log('Initializing knowledge_domains collection');
      
      // Insert default knowledge domains
      await knowledgeDomainsCollection.insertMany([
        {
          id: 'task_management',
          name: 'Task Management',
          description: 'Knowledge about managing and executing tasks efficiently',
          keywords: ['task', 'management', 'execution', 'efficiency'],
          resources: []
        },
        {
          id: 'quality_control',
          name: 'Quality Control',
          description: 'Knowledge about ensuring quality and accuracy in work',
          keywords: ['quality', 'control', 'accuracy', 'verification'],
          resources: []
        },
        {
          id: 'process_execution',
          name: 'Process Execution',
          description: 'Knowledge about following and executing processes and procedures',
          keywords: ['process', 'execution', 'procedure', 'workflow'],
          resources: []
        }
      ]);
      
      console.log('Knowledge domains initialized');
    } else {
      console.log('Knowledge domains collection already has data');
    }

    console.log('MongoDB initialization complete');
  } catch (error) {
    console.error('Error initializing MongoDB data:', error);
  } finally {
    await client.close();
    console.log('MongoDB connection closed');
  }
}

// Run the initialization function
initializeMongoData().catch(console.error);
