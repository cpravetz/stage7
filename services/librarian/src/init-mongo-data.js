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
          id: 'executor',
          name: 'Executor',
          description: 'A role focused on executing tasks efficiently and reliably',
          capabilities: ['task_execution', 'process_following', 'reliability'],
          requiredKnowledgeDomains: ['task_management', 'process_execution'],
          defaultPrompt: 'You are an executor agent responsible for carrying out tasks efficiently and reliably. Focus on completing the assigned task with precision and attention to detail.',
          performanceMetrics: {
            efficiency: 'Time taken to complete tasks',
            accuracy: 'Correctness of task execution',
            reliability: 'Consistency in task performance'
          }
        },
        {
          id: 'researcher',
          name: 'Researcher',
          description: 'A role focused on gathering and analyzing information',
          capabilities: ['information_gathering', 'analysis', 'critical_thinking'],
          requiredKnowledgeDomains: ['research_methodology', 'information_analysis'],
          defaultPrompt: 'You are a researcher agent responsible for gathering and analyzing information. Focus on finding relevant, accurate, and comprehensive information to address the research question.',
          performanceMetrics: {
            thoroughness: 'Comprehensiveness of information gathered',
            accuracy: 'Correctness of information and analysis',
            relevance: 'Relevance of information to the research question'
          }
        },
        {
          id: 'creative',
          name: 'Creative',
          description: 'A role focused on generating creative content and ideas',
          capabilities: ['creativity', 'originality', 'expression'],
          requiredKnowledgeDomains: ['creative_processes', 'content_creation'],
          defaultPrompt: 'You are a creative agent responsible for generating original and engaging content. Focus on creativity, originality, and expressiveness in your work.',
          performanceMetrics: {
            originality: 'Uniqueness and novelty of ideas',
            quality: 'Overall quality of creative output',
            engagement: 'How engaging and compelling the content is'
          }
        },
        {
          id: 'critic',
          name: 'Critic',
          description: 'A role focused on evaluating and providing feedback',
          capabilities: ['evaluation', 'feedback', 'critical_analysis'],
          requiredKnowledgeDomains: ['evaluation_methods', 'quality_control'],
          defaultPrompt: 'You are a critic agent responsible for evaluating work and providing constructive feedback. Focus on identifying strengths, weaknesses, and areas for improvement.',
          performanceMetrics: {
            thoroughness: 'Comprehensiveness of evaluation',
            constructiveness: 'Helpfulness of feedback provided',
            fairness: 'Objectivity and balance in criticism'
          }
        },
        {
          id: 'coordinator',
          name: 'Coordinator',
          description: 'A role focused on organizing and managing activities',
          capabilities: ['organization', 'planning', 'coordination'],
          requiredKnowledgeDomains: ['project_management', 'team_coordination'],
          defaultPrompt: 'You are a coordinator agent responsible for organizing and managing activities. Focus on efficient planning, resource allocation, and coordination of efforts.',
          performanceMetrics: {
            efficiency: 'Effectiveness of organization and planning',
            communication: 'Clarity and timeliness of communication',
            adaptability: 'Ability to adjust plans as needed'
          }
        },
        {
          id: 'domain_expert',
          name: 'Domain Expert',
          description: 'A role focused on providing specialized knowledge and guidance',
          capabilities: ['expertise', 'guidance', 'explanation'],
          requiredKnowledgeDomains: ['specialized_knowledge', 'teaching_methods'],
          defaultPrompt: 'You are a domain expert agent responsible for providing specialized knowledge and guidance. Focus on sharing accurate, relevant expertise and explaining complex concepts clearly.',
          performanceMetrics: {
            accuracy: 'Correctness of information provided',
            clarity: 'Clarity of explanations',
            helpfulness: 'Usefulness of guidance provided'
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
          id: 'process_execution',
          name: 'Process Execution',
          description: 'Knowledge about following and executing processes and procedures',
          keywords: ['process', 'execution', 'procedure', 'workflow'],
          resources: []
        },
        {
          id: 'research_methodology',
          name: 'Research Methodology',
          description: 'Knowledge about conducting research effectively',
          keywords: ['research', 'methodology', 'investigation', 'inquiry'],
          resources: []
        },
        {
          id: 'information_analysis',
          name: 'Information Analysis',
          description: 'Knowledge about analyzing and synthesizing information',
          keywords: ['analysis', 'synthesis', 'evaluation', 'information'],
          resources: []
        },
        {
          id: 'creative_processes',
          name: 'Creative Processes',
          description: 'Knowledge about creative thinking and ideation',
          keywords: ['creativity', 'ideation', 'innovation', 'originality'],
          resources: []
        },
        {
          id: 'content_creation',
          name: 'Content Creation',
          description: 'Knowledge about creating various types of content',
          keywords: ['content', 'creation', 'production', 'development'],
          resources: []
        },
        {
          id: 'evaluation_methods',
          name: 'Evaluation Methods',
          description: 'Knowledge about methods for evaluating quality and performance',
          keywords: ['evaluation', 'assessment', 'measurement', 'appraisal'],
          resources: []
        },
        {
          id: 'quality_control',
          name: 'Quality Control',
          description: 'Knowledge about ensuring quality and accuracy in work',
          keywords: ['quality', 'control', 'assurance', 'standards'],
          resources: []
        },
        {
          id: 'project_management',
          name: 'Project Management',
          description: 'Knowledge about managing projects effectively',
          keywords: ['project', 'management', 'planning', 'execution'],
          resources: []
        },
        {
          id: 'team_coordination',
          name: 'Team Coordination',
          description: 'Knowledge about coordinating team efforts',
          keywords: ['team', 'coordination', 'collaboration', 'cooperation'],
          resources: []
        },
        {
          id: 'specialized_knowledge',
          name: 'Specialized Knowledge',
          description: 'Deep knowledge in specific domains',
          keywords: ['specialized', 'expert', 'domain', 'knowledge'],
          resources: []
        },
        {
          id: 'teaching_methods',
          name: 'Teaching Methods',
          description: 'Knowledge about effective teaching and explanation',
          keywords: ['teaching', 'explanation', 'instruction', 'education'],
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
