const fs = require('fs');
const path = require('path');

const filePath = '/mnt/1tbHD/ckt_web/stage7/services/tool-executor/src/data/skills/career/index.ts';
const content = fs.readFileSync(filePath, 'utf8');

// Define the proper outputSchema replacements for each tool
const replacements = [
  // career_setup (lines ~138-145)
  {
    from: `    outputSchema: {
      success: 'boolean',
      profileId: 'string',
      profilePath: 'string',
      workspace: 'string',
      directoriesCreated: 'array',
      profile: 'object',
    },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the setup succeeded' },
        profileId: { type: 'string', description: 'Unique identifier for the created profile' },
        profilePath: { type: 'string', description: 'File path where the profile was stored' },
        workspace: { type: 'string', description: 'Base workspace directory path' },
        directoriesCreated: { type: 'array', description: 'List of created directory names' },
        profile: { type: 'object', description: 'The created profile object' },
      },
      required: ['success', 'profileId', 'profilePath', 'workspace', 'directoriesCreated', 'profile'],
    },`
  },
  // career_scrape (line 249)
  {
    from: `    outputSchema: { success: 'boolean', listings: 'array', total: 'number', storagePath: 'string' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the job scraping succeeded' },
        listings: { type: 'array', description: 'Array of scraped job listings' },
        total: { type: 'number', description: 'Total number of listings scraped' },
        storagePath: { type: 'string', description: 'File path where listings were stored' },
      },
      required: ['success', 'listings', 'total', 'storagePath'],
    },`
  },
  // career_apply (line 415)
  {
    from: `    outputSchema: { success: 'boolean', applications: 'array', errors: 'array', submitted: 'number', trackingPath: 'string' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether all applications succeeded' },
        applications: { type: 'array', description: 'Array of application results' },
        errors: { type: 'array', description: 'Array of application errors' },
        submitted: { type: 'number', description: 'Number of successfully submitted applications' },
        trackingPath: { type: 'string', description: 'File path where application tracking was stored' },
      },
      required: ['success', 'applications', 'errors', 'submitted', 'trackingPath'],
    },`
  },
  // career_rank (line 548)
  {
    from: `    outputSchema: { success: 'boolean', ranked: 'array', totalScored: 'number', rankPath: 'string' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the ranking succeeded' },
        ranked: { type: 'array', description: 'Array of ranked job listings with scores' },
        totalScored: { type: 'number', description: 'Total number of jobs scored' },
        rankPath: { type: 'string', description: 'File path where rankings were stored' },
      },
      required: ['success', 'ranked', 'totalScored', 'rankPath'],
    },`
  },
  // career_interview (line 663)
  {
    from: `    outputSchema: { success: 'boolean', prep: 'object', entry: 'object', prepPath: 'string' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the interview prep succeeded' },
        prep: { type: 'object', description: 'Interview preparation materials' },
        entry: { type: 'object', description: 'Scheduled or completed interview entry' },
        prepPath: { type: 'string', description: 'File path where prep materials were stored' },
      },
      required: ['success', 'prep', 'entry', 'prepPath'],
    },`
  },
  // career_outcome (line 755)
  {
    from: `    outputSchema: { success: 'boolean', entry: 'object', stats: 'object', trackingPath: 'string' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the outcome was recorded' },
        entry: { type: 'object', description: 'The recorded outcome entry' },
        stats: { type: 'object', description: 'Aggregated career search statistics' },
        trackingPath: { type: 'string', description: 'File path where tracking was stored' },
      },
      required: ['success', 'entry', 'stats', 'trackingPath'],
    },`
  },
  // career_expand (line 862)
  {
    from: `    outputSchema: { success: 'boolean', expanded: 'object', outPath: 'string', newTitles: 'number', newCompanies: 'number' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the search expansion succeeded' },
        expanded: { type: 'object', description: 'Expanded search criteria (titles, companies, keywords)' },
        outPath: { type: 'string', description: 'File path where expansion was stored' },
        newTitles: { type: 'number', description: 'Number of new titles discovered' },
        newCompanies: { type: 'number', description: 'Number of new companies discovered' },
      },
      required: ['success', 'expanded', 'outPath', 'newTitles', 'newCompanies'],
    },`
  },
  // career_upskill (line 946)
  {
    from: `    outputSchema: { success: 'boolean', plan: 'object', outPath: 'string', gapsCount: 'number', milestonesCount: 'number' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the upskill plan was generated' },
        plan: { type: 'object', description: 'The upskilling plan with milestones' },
        outPath: { type: 'string', description: 'File path where plan was stored' },
        gapsCount: { type: 'number', description: 'Number of skill gaps identified' },
        milestonesCount: { type: 'number', description: 'Number of milestones in the plan' },
      },
      required: ['success', 'plan', 'outPath', 'gapsCount', 'milestonesCount'],
    },`
  },
  // career_html_report (line 1011)
  {
    from: `    outputSchema: { success: 'boolean', html: 'string', outPath: 'string', stats: 'object' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the report was generated' },
        html: { type: 'string', description: 'The generated HTML report content' },
        outPath: { type: 'string', description: 'File path where report was stored' },
        stats: { type: 'object', description: 'Summary statistics included in the report' },
      },
      required: ['success', 'html', 'outPath', 'stats'],
    },`
  },
  // career_notion_sync (line 1099)
  {
    from: `    outputSchema: { success: 'boolean', data: 'object' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the Notion sync succeeded' },
        data: { type: 'object', description: 'Sync results with direction and per-entity results' },
      },
      required: ['success', 'data'],
    },`
  },
  // career_gmail_sync (line 1214)
  {
    from: `    outputSchema: { success: 'boolean', data: 'object' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the Gmail sync succeeded' },
        data: { type: 'object', description: 'Sync results with parsed emails and outcomes' },
      },
      required: ['success', 'data'],
    },`
  },
  // career_add_template (line 1277)
  {
    from: `    outputSchema: { success: 'boolean', template: 'object', outPath: 'string' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the template was added' },
        template: { type: 'object', description: 'The created template object' },
        outPath: { type: 'string', description: 'File path where template was stored' },
      },
      required: ['success', 'template', 'outPath'],
    },`
  },
  // career_add_portal (line 1351)
  {
    from: `    outputSchema: { success: 'boolean', portal: 'object', portalsPath: 'string', totalPortals: 'number' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the portal was added' },
        portal: { type: 'object', description: 'The created portal configuration' },
        portalsPath: { type: 'string', description: 'File path where portals are stored' },
        totalPortals: { type: 'number', description: 'Total number of registered portals' },
      },
      required: ['success', 'portal', 'portalsPath', 'totalPortals'],
    },`
  },
  // career_reset (line 1429)
  {
    from: `    outputSchema: { success: 'boolean', data: 'object' },`,
    to: `    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the reset succeeded' },
        data: { type: 'object', description: 'Reset details including scope, targets, and archived paths' },
      },
      required: ['success', 'data'],
    },`
  },
];

let updatedContent = content;
let replaceCount = 0;

for (const { from, to } of replacements) {
  if (updatedContent.includes(from)) {
    updatedContent = updatedContent.replace(from, to);
    replaceCount++;
    console.log(`Replaced: ${from.substring(0, 60)}...`);
  } else {
    console.log(`NOT FOUND: ${from.substring(0, 80)}...`);
  }
}

console.log(`\nTotal replacements made: ${replaceCount}`);

fs.writeFileSync(filePath, updatedContent);
console.log('File updated successfully!');
