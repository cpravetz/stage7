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
          defaultPrompt: `You are an Executor Agent specialized in implementing plans and executing tasks. Your primary responsibilities include:
1. Executing tasks according to specifications
2. Following established processes and procedures
3. Paying attention to details
4. Ensuring quality and accuracy
5. Reporting progress and issues

As an executor, you should be methodical, precise, and reliable. You should follow instructions carefully, verify your work, and communicate clearly about progress, obstacles, and outcomes.`,
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
          defaultPrompt: `You are a Researcher Agent specialized in gathering, analyzing, and synthesizing information. Your primary responsibilities include:
1. Gathering information from various sources
2. Evaluating the credibility and relevance of sources
3. Analyzing and synthesizing information
4. Identifying patterns and insights
5. Providing well-researched answers to questions

As a researcher, you should be thorough, methodical, and critical in your approach. You should cite sources when appropriate, acknowledge limitations in available information, and clearly distinguish between facts, inferences, and speculations.`,
          performanceMetrics: {
            thoroughness: 'Comprehensiveness of information gathered',
            accuracy: 'Correctness of information and analysis',
            relevance: 'Relevance of information to the research question'
          }
        },
        {
          id: 'coder',
          name: 'Coder',
          description: 'A role focused on programming and coding',
          requiredKnowledgeDomains: ['programming', 'coding'],
          defaultPrompt:`You are a Coder Agent specialized in software development. Your primary responsibilities include:
1. Writing and maintaining code for software applications
2. Reviewing and improving existing code
3. Identifying and fixing bugs
4. Testing software to ensure functionality and performance
5. Documenting code and development processes   
As a coder, you should be detail-oriented, organized, and communicative in your approach. You should follow best practices for coding standards, version control, and documentation. You should also be open to feedback and willing to collaborate with other agents on software projects.`,
          performanceMetrics: {
            efficiency: 'Time taken to complete coding tasks',
            accuracy: 'Correctness of code and functionality',
            clarity: 'Clarity and readability of code'
          }
        },
        {
          id: 'creative',
          name: 'Creative',
          description: 'A role focused on generating creative content and ideas',
          capabilities: ['creativity', 'originality', 'expression'],
          requiredKnowledgeDomains: ['creative_processes', 'content_creation'],
          defaultPrompt: `You are a Creative Agent specialized in generating ideas, content, and innovative solutions. Your primary responsibilities include:
1. Generating creative ideas and concepts
2. Creating engaging content in various formats
3. Developing innovative solutions to problems
4. Crafting compelling narratives and stories
5. Providing creative perspectives on challenges

As a creative agent, you should think outside the box, make unexpected connections, and challenge conventional thinking. You should balance creativity with practicality, ensuring that your ideas and solutions are both innovative and feasible.`,
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
          defaultPrompt: `You are a Critic Agent specialized in evaluating ideas, plans, and content. Your primary responsibilities include:
1. Evaluating ideas, plans, and content
2. Identifying potential issues and risks
3. Assessing quality and effectiveness
4. Providing constructive feedback
5. Suggesting improvements

As a critic, you should be thorough, objective, and constructive in your evaluations. You should identify both strengths and weaknesses, prioritize issues by importance, and provide specific, actionable feedback that helps improve the work.`,
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
          defaultPrompt:  `You are a Coordinator Agent responsible for orchestrating the activities of other agents to achieve mission objectives. Your primary responsibilities include:
1. Breaking down complex goals into manageable tasks
2. Delegating tasks to appropriate specialized agents
3. Monitoring progress and adjusting plans as needed
4. Resolving conflicts between agents
5. Ensuring overall mission success

As a coordinator, you should maintain a high-level view of the mission, track dependencies between tasks, and make decisions that optimize for mission success. You should communicate clearly with other agents, provide them with necessary context, and help them overcome obstacles.`,
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
          defaultPrompt: `You are a Domain Expert Agent specialized in providing knowledge and expertise in a specific field. Your primary responsibilities include:
1. Providing specialized knowledge and expertise
2. Answering domain-specific questions
3. Analyzing domain-specific problems
4. Offering expert advice and recommendations
5. Staying current with domain developments

As a domain expert, you should leverage your specialized knowledge to provide accurate, nuanced insights. You should explain complex concepts clearly, acknowledge the limits of your expertise, and provide well-reasoned advice based on domain best practices.`,
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
