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

    // Initialize knowledge_documents collection
    const knowledgeDocumentsCollection = db.collection('knowledge_documents');

    // Check if collection is empty
    const knowledgeDocumentCount = await knowledgeDocumentsCollection.countDocuments();
    if (knowledgeDocumentCount === 0) {
      console.log('Initializing knowledge_documents collection');

      // Insert KB documents for each assistant domain
      await knowledgeDocumentsCollection.insertMany([
        // CTO
        { id: 'cto-architecture-principles', title: 'CTO Architecture Principles', content: 'Foundational principles for technical architecture decisions including scalability, maintainability, and technology selection. Emphasizes evidence-based recommendations and explicit trade-off analysis for engineering leadership.', source: 'design-doc', tags: ['architecture', 'leadership', 'technology'], domain: 'technology' },
        { id: 'cto-safety-guidelines', title: 'CTO Safety Guidelines', content: 'Guidelines for risk mitigation in technical systems, incident response protocols, and safety-first engineering practices. Covers monitoring, alerting, and escalation procedures.', source: 'internal-docs', tags: ['safety', 'risk', 'incident-response'], domain: 'technology' },
        { id: 'cto-engineering-playbooks', title: 'CTO Engineering Playbooks', content: 'Standard playbooks for engineering operations including team scaling, technical debt management, and development workflow optimization. Defines repeatable processes for engineering excellence.', source: 'best-practices', tags: ['engineering', 'playbook', 'scaling'], domain: 'technology' },

        // Career
        { id: 'career-job-search-playbooks', title: 'Career Job Search Playbooks', content: 'Comprehensive playbooks for job search strategies including profile optimization, opportunity discovery, application management, and interview preparation across multiple job portals.', source: 'design-doc', tags: ['job-search', 'interview', 'career'], domain: 'career' },
        { id: 'career-honesty-guidelines', title: 'Career Honesty Guidelines', content: 'Guidelines for maintaining integrity in career development including transparent self-assessment, truthful resume practices, and ethical interview conduct. Directs credential handling to vault.', source: 'best-practices', tags: ['integrity', 'ethics', 'resume'], domain: 'career' },
        { id: 'career-platform-integrations', title: 'Career Platform Integrations', content: 'Integration guidance for career platforms including Notion sync, Gmail integration, template management, and portal connectivity. Covers workspace reset and data synchronization.', source: 'internal-docs', tags: ['integration', 'platform', 'sync'], domain: 'career' },

        // Content
        { id: 'content-strategy-principles', title: 'Content Strategy Principles', content: 'Core principles for content strategy including SEO evaluation, editorial planning, and audience targeting. Focuses on creating engaging content for blogs, social media, and newsletters.', source: 'design-doc', tags: ['content', 'strategy', 'seo'], domain: 'marketing' },
        { id: 'content-editorial-standards', title: 'Content Editorial Standards', content: 'Editorial standards for content quality including tone adaptation, brand consistency, and search intent optimization. Ensures content meets publishing benchmarks.', source: 'internal-docs', tags: ['editorial', 'brand', 'quality'], domain: 'marketing' },
        { id: 'content-brand-guidelines', title: 'Content Brand Guidelines', content: 'Brand guidelines for content creators covering voice, messaging, and multi-channel publishing standards. Aligns content with brand identity and conversion goals.', source: 'best-practices', tags: ['brand', 'publishing', 'voice'], domain: 'marketing' },

        // Healthcare
        { id: 'healthcare-clinical-framework', title: 'Healthcare Clinical Framework', content: 'Clinical framework for healthcare advisory including symptom awareness, wellness guidance, and evidence-based health information. Always recommends consulting qualified medical professionals.', source: 'design-doc', tags: ['clinical', 'health', 'evidence-based'], domain: 'healthcare' },
        { id: 'healthcare-safety-guidelines', title: 'Healthcare Safety Guidelines', content: 'Safety guidelines for healthcare interactions including scope-of-practice boundaries, diagnostic disclaimers, and care referral protocols. Ensures safe patient-facing guidance.', source: 'internal-docs', tags: ['safety', 'scope', 'referral'], domain: 'healthcare' },
        { id: 'healthcare-privacy-compliance', title: 'Healthcare Privacy Compliance', content: 'Privacy compliance framework for healthcare data including HIPAA considerations, patient data handling, and confidentiality requirements. Ensures regulatory compliance.', source: 'best-practices', tags: ['privacy', 'HIPAA', 'compliance'], domain: 'healthcare' },

        // Restaurant
        { id: 'restaurant-operations-playbook', title: 'Restaurant Operations Playbook', content: 'Operations playbook for restaurant management covering inventory tracking, staff scheduling, vendor relations, and cost management. Focuses on operational efficiency.', source: 'design-doc', tags: ['operations', 'inventory', 'staffing'], domain: 'operations' },
        { id: 'restaurant-safety-guidelines', title: 'Restaurant Safety Guidelines', content: 'Safety guidelines for restaurant operations including health compliance, food safety protocols, and kitchen safety standards. Ensures regulatory adherence.', source: 'internal-docs', tags: ['safety', 'food-safety', 'compliance'], domain: 'operations' },
        { id: 'restaurant-menu-planning', title: 'Restaurant Menu Planning', content: 'Menu planning framework covering menu engineering, cost strategy, seasonal adjustments, and customer preference analysis. Balances profitability with guest satisfaction.', source: 'best-practices', tags: ['menu', 'cost', 'planning'], domain: 'operations' },

        // HR
        { id: 'hr-recruitment-framework', title: 'HR Recruitment Framework', content: 'Recruitment framework covering job postings, candidate screening, interview scheduling, and onboarding workflows. Emphasizes fairness and confidentiality.', source: 'design-doc', tags: ['recruitment', 'hiring', 'workflow'], domain: 'hr' },
        { id: 'hr-compliance-guidelines', title: 'HR Compliance Guidelines', content: 'Compliance guidelines for HR operations including labor laws, equal opportunity requirements, and data privacy in hiring. Ensures regulatory adherence.', source: 'internal-docs', tags: ['compliance', 'labor-law', 'fairness'], domain: 'hr' },
        { id: 'hr-onboarding-playbook', title: 'HR Onboarding Playbook', content: 'Onboarding playbook for new employee integration including orientation workflows, documentation, and milestone tracking. Ensures smooth transition for hires.', source: 'best-practices', tags: ['onboarding', 'orientation', 'documentation'], domain: 'hr' },

        // Executive
        { id: 'executive-leadership-principles', title: 'Executive Leadership Principles', content: 'Leadership principles for executive advisors covering strategic decision-making, stakeholder management, and organizational influence. Balances action with alignment.', source: 'design-doc', tags: ['leadership', 'strategy', 'stakeholders'], domain: 'executive' },
        { id: 'executive-strategy-playbook', title: 'Executive Strategy Playbook', content: 'Strategy playbook for executive leadership including career development planning, feedback delivery frameworks, and risk scenario preparation. Supports decisive leadership.', source: 'internal-docs', tags: ['strategy', 'feedback', 'risk'], domain: 'executive' },
        { id: 'executive-risk-framework', title: 'Executive Risk Framework', content: 'Risk framework for executive decision-making covering scenario analysis, contingency planning, and risk mitigation strategies. Ensures balanced risk management.', source: 'best-practices', tags: ['risk', 'scenario', 'contingency'], domain: 'executive' },

        // Legal
        { id: 'legal-contract-principles', title: 'Legal Contract Principles', content: 'Core principles for contract analysis and review including key clauses, risk identification, and negotiation considerations. Notes this is not legal advice.', source: 'design-doc', tags: ['contract', 'review', 'clauses'], domain: 'legal' },
        { id: 'legal-safety-guidelines', title: 'Legal Safety Guidelines', content: 'Safety guidelines for legal operations including scope limitations, conflict checks, and escalation procedures. Always recommends consulting qualified counsel.', source: 'internal-docs', tags: ['safety', 'scope', 'escalation'], domain: 'legal' },
        { id: 'legal-compliance-framework', title: 'Legal Compliance Framework', content: 'Compliance framework for legal matters including regulatory tracking, matter document operations, and research methodologies. Ensures systematic legal oversight.', source: 'best-practices', tags: ['compliance', 'regulation', 'research'], domain: 'legal' },

        // Sales
        { id: 'sales-outreach-framework', title: 'Sales Outreach Framework', content: 'Outreach framework for sales advisors covering lead qualification, deal advisory, and personalized outreach drafting. Focuses on buyer-centric value propositions.', source: 'design-doc', tags: ['outreach', 'leads', 'deals'], domain: 'sales' },
        { id: 'sales-pipeline-principles', title: 'Sales Pipeline Principles', content: 'Pipeline principles for sales operations including deal staging, conversion metrics, and pipeline health monitoring. Drives measurable next steps.', source: 'internal-docs', tags: ['pipeline', 'metrics', 'conversion'], domain: 'sales' },
        { id: 'sales-negotiation-playbook', title: 'Sales Negotiation Playbook', content: 'Negotiation playbook for sales teams covering deal closing strategies, objection handling, and value demonstration. Balances assertiveness with relationship building.', source: 'best-practices', tags: ['negotiation', 'closing', 'objections'], domain: 'sales' },

        // Event
        { id: 'event-planning-playbook', title: 'Event Planning Playbook', content: 'Event planning playbook covering event design, budget management, vendor coordination, and logistical planning. Tracks dependencies and mitigates risks proactively.', source: 'design-doc', tags: ['planning', 'budget', 'vendor'], domain: 'events' },
        { id: 'event-safety-guidelines', title: 'Event Safety Guidelines', content: 'Safety guidelines for event operations including venue compliance, emergency procedures, and attendee safety protocols. Ensures safe event execution.', source: 'internal-docs', tags: ['safety', 'venue', 'emergency'], domain: 'events' },
        { id: 'event-logistics-framework', title: 'Event Logistics Framework', content: 'Logistics framework for event day operations including scheduling, resource allocation, and vendor management. Ensures smooth day-of execution.', source: 'best-practices', tags: ['logistics', 'operations', 'day-of'], domain: 'events' },

        // Songwriter
        { id: 'songwriter-creative-principles', title: 'Songwriter Creative Principles', content: 'Creative principles for songwriting collaborators covering lyric evaluation, prosody analysis, and musical co-creation. Respects creative intent and copyright.', source: 'design-doc', tags: ['creative', 'lyrics', 'music'], domain: 'creative' },
        { id: 'songwriter-copyright-guidelines', title: 'Songwriter Copyright Guidelines', content: 'Copyright guidelines for songwriters covering intellectual property, licensing basics, and attribution practices. Protects creative works and respects others rights.', source: 'internal-docs', tags: ['copyright', 'licensing', 'ip'], domain: 'creative' },
        { id: 'songwriter-collaboration-playbook', title: 'Songwriter Collaboration Playbook', content: 'Collaboration playbook for musical co-creation including session workflows, demo production, and lead sheet preparation. Enhances creative teamwork.', source: 'best-practices', tags: ['collaboration', 'demo', 'session'], domain: 'creative' },

        // Scriptwriter
        { id: 'scriptwriter-narrative-framework', title: 'Scriptwriter Narrative Framework', content: 'Narrative framework for screenwriters covering story arc evaluation, pacing analysis, and structural integrity. Ensures compelling storytelling.', source: 'design-doc', tags: ['narrative', 'structure', 'pacing'], domain: 'creative' },
        { id: 'scriptwriter-formatting-guidelines', title: 'Scriptwriter Formatting Guidelines', content: 'Formatting guidelines for scripts covering industry standards, submission requirements, and template usage. Ensures professional-quality formatting.', source: 'internal-docs', tags: ['formatting', 'industry', 'submission'], domain: 'creative' },
        { id: 'scriptwriter-drafting-playbook', title: 'Scriptwriter Drafting Playbook', content: 'Drafting playbook for screenwriters covering scene co-piloting, dialogue development, and revision workflows. Supports efficient script production.', source: 'best-practices', tags: ['drafting', 'dialogue', 'revision'], domain: 'creative' },

        // Sports
        { id: 'sports-analytics-framework', title: 'Sports Analytics Framework', content: 'Analytics framework for sports analysts covering tactical evaluation, roster strategy, and game plan creation. Data-driven sports analysis.', source: 'design-doc', tags: ['analytics', 'tactics', 'strategy'], domain: 'sports' },
        { id: 'sports-safety-guidelines', title: 'Sports Safety Guidelines', content: 'Safety guidelines for sports analysis including injury prevention, player welfare, and responsible gambling disclaimers. Ensures ethical analysis.', source: 'internal-docs', tags: ['safety', 'welfare', 'ethics'], domain: 'sports' },
        { id: 'sports-strategy-playbook', title: 'Sports Strategy Playbook', content: 'Strategy playbook covering scouting alerts, matchup analysis, bankroll management guidance, and line monitoring. All analysis is informational, not financial advice.', source: 'best-practices', tags: ['strategy', 'scouting', 'bankroll'], domain: 'sports' },

        // Finance
        { id: 'finance-modeling-standards', title: 'Finance Modeling Standards', content: 'Standards for financial modeling including model structure, assumption documentation, and scenario analysis. Flags assumptions for professional review.', source: 'design-doc', tags: ['modeling', 'assumptions', 'scenarios'], domain: 'finance' },
        { id: 'finance-safety-guidelines', title: 'Finance Safety Guidelines', content: 'Safety guidelines for financial advisory including risk disclaimers, regulatory boundaries, and recommendation safeguards. Encourages professional review.', source: 'internal-docs', tags: ['safety', 'risk', 'regulation'], domain: 'finance' },
        { id: 'finance-budgeting-framework', title: 'Finance Budgeting Framework', content: 'Budgeting framework for financial planning including tracking methodologies, reporting standards, and variance analysis. Supports budget discipline.', source: 'best-practices', tags: ['budgeting', 'tracking', 'reporting'], domain: 'finance' },

        // Investment
        { id: 'investment-portfolio-framework', title: 'Investment Portfolio Framework', content: 'Portfolio framework for investment advisors covering market data analysis, portfolio construction, and diversification strategies. Informational, not personalized advice.', source: 'design-doc', tags: ['portfolio', 'market', 'diversification'], domain: 'finance' },
        { id: 'investment-risk-guidelines', title: 'Investment Risk Guidelines', content: 'Risk guidelines for investment management including risk assessment, regulatory compliance, and disclosure requirements. All output is informational.', source: 'internal-docs', tags: ['risk', 'compliance', 'disclosure'], domain: 'finance' },
        { id: 'investment-research-playbook', title: 'Investment Research Playbook', content: 'Research playbook for investment analysts covering research planning, data gathering, and bill pay rebalancing. Supports informed investment decisions.', source: 'best-practices', tags: ['research', 'planning', 'rebalancing'], domain: 'finance' },

        // Hotel
        { id: 'hotel-operations-framework', title: 'Hotel Operations Framework', content: 'Operations framework for hotel management covering reservations, property operations, and operational efficiency. Prioritizes guest satisfaction.', source: 'design-doc', tags: ['operations', 'reservations', 'property'], domain: 'hospitality' },
        { id: 'hotel-hospitality-guidelines', title: 'Hotel Hospitality Guidelines', content: 'Hospitality guidelines for guest experience including service standards, personalization approaches, and quality benchmarks. Ensures exceptional guest experiences.', source: 'internal-docs', tags: ['hospitality', 'service', 'quality'], domain: 'hospitality' },
        { id: 'hotel-guest-experience-playbook', title: 'Hotel Guest Experience Playbook', content: 'Guest experience playbook covering guest profiles, experience optimization, and revenue performance advisory. Balances satisfaction with profitability.', source: 'best-practices', tags: ['guest-experience', 'revenue', 'profiles'], domain: 'hospitality' },

        // Education
        { id: 'education-pedagogy-framework', title: 'Education Pedagogy Framework', content: 'Pedagogy framework for education advisors covering lesson drafting, assessment design, and evidence-based teaching strategies. Supports effective learning.', source: 'design-doc', tags: ['pedagogy', 'lesson', 'assessment'], domain: 'education' },
        { id: 'education-accessibility-guidelines', title: 'Education Accessibility Guidelines', content: 'Accessibility guidelines for educational content including inclusive design, learner diversity, and accommodation practices. Ensures equitable learning access.', source: 'internal-docs', tags: ['accessibility', 'inclusion', 'diversity'], domain: 'education' },
        { id: 'education-curriculum-playbook', title: 'Education Curriculum Playbook', content: 'Curriculum playbook covering adaptive personalization, resource library management, and learner analytics. Supports personalized learning paths.', source: 'best-practices', tags: ['curriculum', 'personalization', 'analytics'], domain: 'education' },

        // Support
        { id: 'support-ticketing-framework', title: 'Support Ticketing Framework', content: 'Ticketing framework for support advisors covering ticket understanding, categorization, and routing. Ensures efficient ticket processing and resolution.', source: 'design-doc', tags: ['ticketing', 'categorization', 'routing'], domain: 'support' },
        { id: 'support-empathy-guidelines', title: 'Support Empathy Guidelines', content: 'Empathy guidelines for customer support including response tone, de-escalation techniques, and empathy-driven communication. Resolves issues with care.', source: 'internal-docs', tags: ['empathy', 'de-escalation', 'tone'], domain: 'support' },
        { id: 'support-analytics-playbook', title: 'Support Analytics Playbook', content: 'Analytics playbook for support operations including response metrics, ticket operations, and analytics planning. Drives data-driven support improvements.', source: 'best-practices', tags: ['analytics', 'metrics', 'operations'], domain: 'support' },

        // Product
        { id: 'product-roadmap-framework', title: 'Product Roadmap Framework', content: 'Roadmap framework for product managers covering PRD drafting, strategic planning, and cross-functional coordination. Aligns decisions with strategy.', source: 'design-doc', tags: ['roadmap', 'PRD', 'strategy'], domain: 'product' },
        { id: 'product-research-guidelines', title: 'Product Research Guidelines', content: 'Research guidelines for product development including user research, document ingestion, and insight synthesis. Supports evidence-based product decisions.', source: 'internal-docs', tags: ['research', 'user-insights', 'documents'], domain: 'product' },
        { id: 'product-launch-playbook', title: 'Product Launch Playbook', content: 'Launch playbook for product delivery covering delivery tracking, product analytics, and team coordination. Ensures successful product releases.', source: 'best-practices', tags: ['launch', 'delivery', 'analytics'], domain: 'product' },

        // Marketing
        { id: 'marketing-campaign-framework', title: 'Marketing Campaign Framework', content: 'Campaign framework for marketing strategists covering planning, drafting, and multi-channel publishing. Optimizes for reach and engagement.', source: 'design-doc', tags: ['campaign', 'planning', 'publishing'], domain: 'marketing' },
        { id: 'marketing-brand-guidelines', title: 'Marketing Brand Guidelines', content: 'Brand guidelines for marketing content including tone, voice consistency, and audience alignment. Ensures cohesive brand presence across channels.', source: 'internal-docs', tags: ['brand', 'voice', 'audience'], domain: 'marketing' },
        { id: 'marketing-analytics-playbook', title: 'Marketing Analytics Playbook', content: 'Analytics playbook for marketing performance including audience insights, engagement metrics, and conversion optimization. Drives measurable results.', source: 'best-practices', tags: ['analytics', 'performance', 'conversion'], domain: 'marketing' },

        // Analytics
        { id: 'analytics-insight-framework', title: 'Analytics Insight Framework', content: 'Insight framework for business analysts covering trend evaluation, data interpretation, and insight communication. Validates assumptions clearly.', source: 'design-doc', tags: ['insight', 'trends', 'data'], domain: 'analytics' },
        { id: 'analytics-data-guidelines', title: 'Analytics Data Guidelines', content: 'Data guidelines for analytics including data quality, validation practices, and uncertainty communication. Ensures reliable analytics outputs.', source: 'internal-docs', tags: ['data', 'validation', 'quality'], domain: 'analytics' },
        { id: 'analytics-reporting-playbook', title: 'Analytics Reporting Playbook', content: 'Reporting playbook for analysts covering report design, recommendation framing, and actionability. Communicates uncertainty and drives decisions.', source: 'best-practices', tags: ['reporting', 'recommendations', 'actionability'], domain: 'analytics' },
      ]);

      console.log('Knowledge documents initialized');
    } else {
      console.log('Knowledge documents collection already has data');
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
