#!/usr/bin/env node

/**
 * Policy Enforcement Script
 * 
 * This script provides automated enforcement of engineering policies
 * by integrating with the development workflow and CI/CD pipelines.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Ajv = require('ajv');
const ajv = new Ajv();

// Policy schema for validation
const policySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    category: { type: 'string', enum: ['code', 'architecture', 'process', 'security', 'performance'] },
    title: { type: 'string' },
    description: { type: 'string' },
    rules: { type: 'array', items: { type: 'string' } },
    enforcementMechanisms: { type: 'array', items: { type: 'string' } },
    complianceMetrics: { type: 'array', items: { type: 'string' } },
    severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    documentation: { type: 'string' },
    examples: { type: 'array', items: { type: 'string' } },
    exceptions: { type: 'array', items: { type: 'string' } },
    validationChecks: { type: 'array', items: { type: 'string' } }
  },
  required: ['id', 'category', 'title', 'description', 'rules', 'severity']
};

class PolicyEnforcementEngine {
  constructor() {
    this.policies = [];
    this.violations = [];
    this.policyDir = path.join(__dirname, '../policies');
  }

  /**
   * Load all policies from the policy repository
   */
  loadPolicies() {
    try {
      // Read the master index
      const indexPath = path.join(this.policyDir, 'index.json');
      const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

      // Load each policy file
      for (const category of index.categories) {
        for (const policy of category.policies) {
          const policyPath = path.join(this.policyDir, policy.file);
          const policyContent = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
          
          // Validate policy structure
          const valid = ajv.validate(policySchema, policyContent);
          if (!valid) {
            console.error(`Invalid policy structure in ${policy.id}:`, ajv.errors);
            continue;
          }
          
          this.policies.push(policyContent);
        }
      }

      console.log(`Loaded ${this.policies.length} policies successfully`);
      return true;
    } catch (error) {
      console.error('Error loading policies:', error.message);
      return false;
    }
  }

  /**
   * Check code quality policy compliance
   */
  checkCodeQualityCompliance() {
    console.log('\n=== Checking Code Quality Policy Compliance ===');
    
    const codePolicies = this.policies.filter(p => p.category === 'code');
    let complianceScore = 0;
    
    // Check for production-ready code policy (CODE-001)
    const prodReadyPolicy = codePolicies.find(p => p.id === 'CODE-001');
    if (prodReadyPolicy) {
      console.log(`\nChecking ${prodReadyPolicy.title}:`);
      
      try {
        // Run tests
        console.log('  - Running tests...');
        execSync('npm test', { stdio: 'pipe' });
        console.log('    ✓ Tests passed');
        
        // Check TypeScript compilation
        console.log('  - Checking TypeScript compilation...');
        execSync('npx tsc --noEmit', { stdio: 'pipe' });
        console.log('    ✓ TypeScript compilation successful');
        
        // Check linting
        console.log('  - Running linting...');
        execSync('npx eslint .', { stdio: 'pipe' });
        console.log('    ✓ Linting passed');
        
        complianceScore += 25;
      } catch (error) {
        console.log('    ✗ Compliance check failed:', error.message);
        this.violations.push({
          policyId: prodReadyPolicy.id,
          policyTitle: prodReadyPolicy.title,
          severity: prodReadyPolicy.severity,
          violation: 'Code quality checks failed',
          details: error.message
        });
      }
    }

    // Check for error handling policy (CODE-002)
    const errorHandlingPolicy = codePolicies.find(p => p.id === 'CODE-002');
    if (errorHandlingPolicy) {
      console.log(`\nChecking ${errorHandlingPolicy.title}:`);
      
      try {
        // Check for proper error handling patterns
        console.log('  - Checking error handling patterns...');
        const codeFiles = this.findTypeScriptFiles('../services');
        let errorHandlingScore = 0;
        
        for (const file of codeFiles) {
          const content = fs.readFileSync(file, 'utf8');
          
          // Simple pattern checking for error handling
          if (content.includes('try {') && content.includes('catch')) {
            errorHandlingScore++;
          }
          
          // Check for proper error logging
          if (content.includes('console.error') || content.includes('logger.error')) {
            errorHandlingScore++;
          }
        }
        
        if (errorHandlingScore > 0) {
          console.log(`    ✓ Found error handling patterns in ${errorHandlingScore} files`);
          complianceScore += 25;
        } else {
          console.log('    ✗ No error handling patterns found');
          this.violations.push({
            policyId: errorHandlingPolicy.id,
            policyTitle: errorHandlingPolicy.title,
            severity: errorHandlingPolicy.severity,
            violation: 'Missing error handling patterns',
            details: 'No try-catch blocks or error logging found'
          });
        }
      } catch (error) {
        console.log('    ✗ Error handling check failed:', error.message);
        this.violations.push({
          policyId: errorHandlingPolicy.id,
          policyTitle: errorHandlingPolicy.title,
          severity: errorHandlingPolicy.severity,
          violation: 'Error handling check failed',
          details: error.message
        });
      }
    }

    return complianceScore;
  }

  /**
   * Check architecture policy compliance
   */
  checkArchitectureCompliance() {
    console.log('\n=== Checking Architecture Policy Compliance ===');
    
    const archPolicies = this.policies.filter(p => p.category === 'architecture');
    let complianceScore = 0;

    // Check for efficient agent usage policy (ARCH-001)
    const agentUsagePolicy = archPolicies.find(p => p.id === 'ARCH-001');
    if (agentUsagePolicy) {
      console.log(`\nChecking ${agentUsagePolicy.title}:`);
      
      try {
        // Check agent-related files for proper patterns
        console.log('  - Checking agent usage patterns...');
        const agentFiles = this.findFiles('../services', ['Agent.ts', 'AgentSet.ts']);
        
        if (agentFiles.length > 0) {
          console.log(`    ✓ Found ${agentFiles.length} agent-related files`);
          
          // Simple check for agent pooling or reuse patterns
          let hasPooling = false;
          for (const file of agentFiles) {
            const content = fs.readFileSync(file, 'utf8');
            if (content.includes('pool') || content.includes('reuse') || content.includes('cache')) {
              hasPooling = true;
              break;
            }
          }
          
          if (hasPooling) {
            console.log('    ✓ Found agent pooling/reuse patterns');
            complianceScore += 25;
          } else {
            console.log('    ! Agent pooling patterns not found (consider implementing)');
          }
        } else {
          console.log('    - No agent files found (may not be applicable)');
        }
        
        complianceScore += 25; // Base score for having agent structure
      } catch (error) {
        console.log('    ✗ Agent usage check failed:', error.message);
        this.violations.push({
          policyId: agentUsagePolicy.id,
          policyTitle: agentUsagePolicy.title,
          severity: agentUsagePolicy.severity,
          violation: 'Agent usage check failed',
          details: error.message
        });
      }
    }

    // Check for verb expansion policy (ARCH-002)
    const verbPolicy = archPolicies.find(p => p.id === 'ARCH-002');
    if (verbPolicy) {
      console.log(`\nChecking ${verbPolicy.title}:`);
      
      try {
        // Check for verb definitions and plugin structure
        console.log('  - Checking verb and plugin structure...');
        const pluginFiles = this.findFiles('../services', ['plugin', 'verb']);
        
        if (pluginFiles.length > 0) {
          console.log(`    ✓ Found ${pluginFiles.length} plugin/verb-related files`);
          complianceScore += 25;
        } else {
          console.log('    - No plugin/verb files found (may not be applicable)');
        }
      } catch (error) {
        console.log('    ✗ Verb expansion check failed:', error.message);
        this.violations.push({
          policyId: verbPolicy.id,
          policyTitle: verbPolicy.title,
          severity: verbPolicy.severity,
          violation: 'Verb expansion check failed',
          details: error.message
        });
      }
    }

    return complianceScore;
  }

  /**
   * Check process policy compliance
   */
  checkProcessCompliance() {
    console.log('\n=== Checking Process Policy Compliance ===');
    
    const processPolicies = this.policies.filter(p => p.category === 'process');
    let complianceScore = 0;

    // Check for strategic alignment policy (PROCESS-001)
    const strategicPolicy = processPolicies.find(p => p.id === 'PROCESS-001');
    if (strategicPolicy) {
      console.log(`\nChecking ${strategicPolicy.title}:`);
      
      try {
        // Check for documentation and architecture files
        console.log('  - Checking for strategic documentation...');
        const docFiles = this.findFiles('../docs', ['architecture', 'strategy', 'roadmap']);
        
        if (docFiles.length > 0) {
          console.log(`    ✓ Found ${docFiles.length} strategic documentation files`);
          complianceScore += 25;
        } else {
          console.log('    ! No strategic documentation found (consider adding)');
        }
        
        // Check for change impact analysis
        console.log('  - Checking for impact analysis patterns...');
        const readmeContent = fs.readFileSync('../README.md', 'utf8');
        if (readmeContent.includes('impact') || readmeContent.includes('strategy')) {
          console.log('    ✓ Found strategic alignment references');
          complianceScore += 25;
        }
      } catch (error) {
        console.log('    ✗ Strategic alignment check failed:', error.message);
        this.violations.push({
          policyId: strategicPolicy.id,
          policyTitle: strategicPolicy.title,
          severity: strategicPolicy.severity,
          violation: 'Strategic alignment check failed',
          details: error.message
        });
      }
    }

    return complianceScore;
  }

  /**
   * Generate compliance report
   */
  generateComplianceReport() {
    console.log('\n=== Policy Compliance Report ===');
    
    const totalScore = this.checkCodeQualityCompliance() + 
                      this.checkArchitectureCompliance() + 
                      this.checkProcessCompliance();
    
    const maxScore = 200; // Maximum possible score
    const compliancePercentage = Math.round((totalScore / maxScore) * 100);
    
    console.log(`\nOverall Compliance Score: ${totalScore}/${maxScore} (${compliancePercentage}%)`);
    
    // Categorize compliance level
    let complianceLevel = 'Excellent';
    if (compliancePercentage >= 90) {
      complianceLevel = 'Excellent';
    } else if (compliancePercentage >= 80) {
      complianceLevel = 'Good';
    } else if (compliancePercentage >= 70) {
      complianceLevel = 'Fair';
    } else if (compliancePercentage >= 60) {
      complianceLevel = 'Needs Improvement';
    } else {
      complianceLevel = 'Poor';
    }
    
    console.log(`Compliance Level: ${complianceLevel}`);
    
    // Report violations
    if (this.violations.length > 0) {
      console.log(`\n⚠️  Policy Violations Found (${this.violations.length}):`);
      
      // Group violations by severity
      const criticalViolations = this.violations.filter(v => v.severity === 'critical');
      const highViolations = this.violations.filter(v => v.severity === 'high');
      const mediumViolations = this.violations.filter(v => v.severity === 'medium');
      const lowViolations = this.violations.filter(v => v.severity === 'low');
      
      if (criticalViolations.length > 0) {
        console.log('\n🔴 Critical Violations:');
        criticalViolations.forEach(v => {
          console.log(`  - [${v.policyId}] ${v.policyTitle}: ${v.violation}`);
          if (v.details) console.log(`    Details: ${v.details}`);
        });
      }
      
      if (highViolations.length > 0) {
        console.log('\n🟠 High Severity Violations:');
        highViolations.forEach(v => {
          console.log(`  - [${v.policyId}] ${v.policyTitle}: ${v.violation}`);
          if (v.details) console.log(`    Details: ${v.details}`);
        });
      }
      
      if (mediumViolations.length > 0) {
        console.log('\n🟡 Medium Severity Violations:');
        mediumViolations.forEach(v => {
          console.log(`  - [${v.policyId}] ${v.policyTitle}: ${v.violation}`);
          if (v.details) console.log(`    Details: ${v.details}`);
        });
      }
      
      if (lowViolations.length > 0) {
        console.log('\n🔵 Low Severity Violations:');
        lowViolations.forEach(v => {
          console.log(`  - [${v.policyId}] ${v.policyTitle}: ${v.violation}`);
          if (v.details) console.log(`    Details: ${v.details}`);
        });
      }
    } else {
      console.log('\n✅ No policy violations found!');
    }
    
    // Generate recommendations
    console.log('\n📋 Recommendations:');
    if (compliancePercentage < 80) {
      console.log('  - Review critical and high severity policy violations immediately');
      console.log('  - Implement automated policy checks in CI/CD pipeline');
      console.log('  - Schedule architecture review to address compliance gaps');
    } else if (compliancePercentage < 90) {
      console.log('  - Address remaining policy violations to achieve excellent compliance');
      console.log('  - Consider adding more comprehensive policy checks');
      console.log('  - Review process policies for continuous improvement');
    } else {
      console.log('  - Maintain current compliance level');
      console.log('  - Continue monitoring for policy adherence');
      console.log('  - Consider adding more sophisticated policy checks');
    }
    
    return {
      score: totalScore,
      maxScore: maxScore,
      percentage: compliancePercentage,
      level: complianceLevel,
      violations: this.violations,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Helper method to find TypeScript files
   */
  findTypeScriptFiles(dir) {
    const files = [];
    this.findFilesRecursive(dir, files, ['.ts']);
    return files;
  }

  /**
   * Helper method to find specific files
   */
  findFiles(dir, keywords) {
    const files = [];
    this.findFilesRecursive(dir, files, ['.ts', '.js'], keywords);
    return files;
  }

  /**
   * Recursive file finder
   */
  findFilesRecursive(currentDir, resultFiles, extensions, keywords = []) {
    try {
      const fullPath = path.join(__dirname, currentDir);
      const items = fs.readdirSync(fullPath);
      
      for (const item of items) {
        const itemPath = path.join(fullPath, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          this.findFilesRecursive(path.join(currentDir, item), resultFiles, extensions, keywords);
        } else if (stat.isFile()) {
          const ext = path.extname(item);
          if (extensions.includes(ext)) {
            // Check if file matches keywords (if provided)
            if (keywords.length === 0) {
              resultFiles.push(itemPath);
            } else {
              const content = fs.readFileSync(itemPath, 'utf8');
              const matchesKeyword = keywords.some(keyword => 
                content.toLowerCase().includes(keyword.toLowerCase())
              );
              if (matchesKeyword) {
                resultFiles.push(itemPath);
              }
            }
          }
        }
      }
    } catch (error) {
      // Silently handle errors (directory doesn't exist, etc.)
    }
  }

  /**
   * Run policy enforcement
   */
  run() {
    console.log('🚀 Starting Policy Enforcement Check...');
    
    // Load policies
    const policiesLoaded = this.loadPolicies();
    if (!policiesLoaded) {
      console.error('❌ Failed to load policies. Aborting.');
      process.exit(1);
    }
    
    // Generate compliance report
    const report = this.generateComplianceReport();
    
    // Exit with appropriate code based on compliance
    if (report.percentage < 70) {
      console.log('\n❌ Compliance too low. Failing build.');
      process.exit(1);
    } else if (report.percentage < 85) {
      console.log('\n⚠️  Compliance acceptable but needs improvement.');
      process.exit(0); // Still pass but with warnings
    } else {
      console.log('\n✅ Compliance excellent. Build can proceed.');
      process.exit(0);
    }
  }
}

// Run the enforcement engine
const engine = new PolicyEnforcementEngine();
engine.run();