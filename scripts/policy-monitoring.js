#!/usr/bin/env node

/**
 * Policy Monitoring System
 * 
 * This script provides continuous monitoring of policy compliance
 * and generates reports for tracking policy conformance over time.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { PolicyEnforcementEngine } = require('./policy-enforcement');

class PolicyMonitoringSystem {
  constructor() {
    this.engine = new PolicyEnforcementEngine();
    this.reportsDir = path.join(__dirname, '../reports/policy-compliance');
    this.historyFile = path.join(this.reportsDir, 'compliance-history.json');
    this.currentReport = null;
    
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Run a compliance scan and generate report
   */
  runComplianceScan() {
    console.log('🔍 Running Policy Compliance Scan...');
    
    // Load policies
    const policiesLoaded = this.engine.loadPolicies();
    if (!policiesLoaded) {
      console.error('❌ Failed to load policies. Aborting scan.');
      return false;
    }
    
    // Generate compliance report
    this.currentReport = this.engine.generateComplianceReport();
    
    // Save detailed report
    this.saveDetailedReport();
    
    // Update compliance history
    this.updateComplianceHistory();
    
    // Generate summary
    this.generateComplianceSummary();
    
    return true;
  }

  /**
   * Save detailed compliance report
   */
  saveDetailedReport() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(this.reportsDir, `compliance-report-${timestamp}.json`);
    
    const detailedReport = {
      timestamp: this.currentReport.timestamp,
      complianceScore: this.currentReport.score,
      maxScore: this.currentReport.maxScore,
      percentage: this.currentReport.percentage,
      level: this.currentReport.level,
      violations: this.currentReport.violations,
      systemInfo: this.getSystemInfo()
    };
    
    fs.writeFileSync(reportFile, JSON.stringify(detailedReport, null, 2));
    console.log(`📄 Saved detailed report: ${reportFile}`);
  }

  /**
   * Update compliance history
   */
  updateComplianceHistory() {
    let history = [];
    
    // Load existing history
    if (fs.existsSync(this.historyFile)) {
      try {
        const historyContent = fs.readFileSync(this.historyFile, 'utf8');
        history = JSON.parse(historyContent);
      } catch (error) {
        console.error('Error loading compliance history:', error.message);
      }
    }
    
    // Add current report to history
    const historyEntry = {
      timestamp: this.currentReport.timestamp,
      score: this.currentReport.score,
      percentage: this.currentReport.percentage,
      level: this.currentReport.level,
      criticalViolations: this.currentReport.violations.filter(v => v.severity === 'critical').length,
      highViolations: this.currentReport.violations.filter(v => v.severity === 'high').length,
      mediumViolations: this.currentReport.violations.filter(v => v.severity === 'medium').length,
      lowViolations: this.currentReport.violations.filter(v => v.severity === 'low').length
    };
    
    history.push(historyEntry);
    
    // Keep only the last 30 entries to prevent file from growing too large
    if (history.length > 30) {
      history = history.slice(-30);
    }
    
    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
    console.log(`📊 Updated compliance history with ${history.length} entries`);
  }

  /**
   * Generate compliance summary report
   */
  generateComplianceSummary() {
    // Load compliance history
    let history = [];
    if (fs.existsSync(this.historyFile)) {
      try {
        const historyContent = fs.readFileSync(this.historyFile, 'utf8');
        history = JSON.parse(historyContent);
      } catch (error) {
        console.error('Error loading compliance history for summary:', error.message);
      }
    }
    
    if (history.length === 0) {
      console.log('No compliance history available for summary');
      return;
    }
    
    // Calculate trends
    const currentScore = history[history.length - 1].percentage;
    const previousScore = history.length > 1 ? history[history.length - 2].percentage : currentScore;
    const trend = currentScore - previousScore;
    
    // Calculate averages
    const totalScore = history.reduce((sum, entry) => sum + entry.percentage, 0);
    const averageScore = totalScore / history.length;
    
    // Generate summary
    const summary = {
      currentCompliance: currentScore,
      trend: trend,
      averageCompliance: averageScore,
      totalScans: history.length,
      bestCompliance: Math.max(...history.map(h => h.percentage)),
      worstCompliance: Math.min(...history.map(h => h.percentage)),
      currentViolations: {
        critical: history[history.length - 1].criticalViolations,
        high: history[history.length - 1].highViolations,
        medium: history[history.length - 1].mediumViolations,
        low: history[history.length - 1].lowViolations
      }
    };
    
    // Save summary
    const summaryFile = path.join(this.reportsDir, 'compliance-summary.json');
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    
    // Display summary
    console.log('\n📈 Compliance Summary:');
    console.log(`  Current Compliance: ${summary.currentCompliance}%`);
    console.log(`  Trend: ${trend >= 0 ? '+' : ''}${trend.toFixed(1)}%`);
    console.log(`  Average Compliance: ${summary.averageCompliance.toFixed(1)}%`);
    console.log(`  Total Scans: ${summary.totalScans}`);
    console.log(`  Best/Worst: ${summary.bestCompliance}% / ${summary.worstCompliance}%`);
    console.log(`  Current Violations: ${summary.currentViolations.critical} critical, ${summary.currentViolations.high} high, ${summary.currentViolations.medium} medium, ${summary.currentViolations.low} low`);
    
    // Generate trend analysis
    this.generateTrendAnalysis(history);
  }

  /**
   * Generate trend analysis
   */
  generateTrendAnalysis(history) {
    if (history.length < 2) return;
    
    console.log('\n📊 Trend Analysis:');
    
    // Calculate 7-day moving average
    const movingAverages = [];
    for (let i = 0; i < history.length; i++) {
      const start = Math.max(0, i - 6);
      const window = history.slice(start, i + 1);
      const avg = window.reduce((sum, entry) => sum + entry.percentage, 0) / window.length;
      movingAverages.push(avg);
    }
    
    const currentMA = movingAverages[movingAverages.length - 1];
    const previousMA = movingAverages.length > 1 ? movingAverages[movingAverages.length - 2] : currentMA;
    
    console.log(`  7-day Moving Average: ${currentMA.toFixed(1)}% (${(currentMA - previousMA).toFixed(1)}%)`);
    
    // Determine trend direction
    if (currentMA > previousMA) {
      console.log('  📈 Trend: Improving');
    } else if (currentMA < previousMA) {
      console.log('  📉 Trend: Declining');
    } else {
      console.log('  📌 Trend: Stable');
    }
  }

  /**
   * Generate compliance dashboard HTML
   */
  generateComplianceDashboard() {
    // Load compliance history
    let history = [];
    if (fs.existsSync(this.historyFile)) {
      try {
        const historyContent = fs.readFileSync(this.historyFile, 'utf8');
        history = JSON.parse(historyContent);
      } catch (error) {
        console.error('Error loading compliance history for dashboard:', error.message);
        return;
      }
    }
    
    if (history.length === 0) {
      console.log('No compliance history available for dashboard');
      return;
    }
    
    // Generate HTML dashboard
    const dashboardHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCS Policy Compliance Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .dashboard { max-width: 1200px; margin: 0 auto; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px; }
        .metric-card { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-card h3 { margin-top: 0; color: #2c3e50; }
        .metric-value { font-size: 24px; font-weight: bold; }
        .trend-up { color: #27ae60; }
        .trend-down { color: #e74c3c; }
        .trend-stable { color: #f39c12; }
        .chart { background: white; border: 1px solid #ddd; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .violation-level { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .violation-bar { height: 20px; background: #3498db; border-radius: 3px; }
        .critical { background: #e74c3c; }
        .high { background: #e67e22; }
        .medium { background: #f39c12; }
        .low { background: #2ecc71; }
        .history-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .history-table th, .history-table td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        .history-table th { background: #f2f2f2; }
        .timestamp { font-size: 12px; color: #7f8c8d; }
    </style>
</head>
<body>
    <div class="dashboard">
        <div class="header">
            <h1>MCS Policy Compliance Dashboard</h1>
            <p>Real-time monitoring of engineering policy compliance</p>
        </div>
        
        <div class="metrics">
            <div class="metric-card">
                <h3>Current Compliance</h3>
                <div class="metric-value">${history[history.length - 1].percentage}%</div>
                <p>Overall policy compliance score</p>
            </div>
            
            <div class="metric-card">
                <h3>Compliance Trend</h3>
                <div class="metric-value ${this.getTrendClass(history)}">
                    ${this.calculateTrend(history)}%
                </div>
                <p>Change from previous scan</p>
            </div>
            
            <div class="metric-card">
                <h3>Average Compliance</h3>
                <div class="metric-value">${this.calculateAverage(history).toFixed(1)}%</div>
                <p>Average over ${history.length} scans</p>
            </div>
            
            <div class="metric-card">
                <h3>Critical Violations</h3>
                <div class="metric-value">${history[history.length - 1].criticalViolations}</div>
                <p>Current critical policy violations</p>
            </div>
        </div>
        
        <div class="chart">
            <h3>Violation Breakdown</h3>
            <div class="violation-level">
                <span>Critical (${history[history.length - 1].criticalViolations})</span>
                <div class="violation-bar critical" style="width: ${this.getViolationWidth(history[history.length - 1].criticalViolations, history[history.length - 1])}%"></div>
            </div>
            <div class="violation-level">
                <span>High (${history[history.length - 1].highViolations})</span>
                <div class="violation-bar high" style="width: ${this.getViolationWidth(history[history.length - 1].highViolations, history[history.length - 1])}%"></div>
            </div>
            <div class="violation-level">
                <span>Medium (${history[history.length - 1].mediumViolations})</span>
                <div class="violation-bar medium" style="width: ${this.getViolationWidth(history[history.length - 1].mediumViolations, history[history.length - 1])}%"></div>
            </div>
            <div class="violation-level">
                <span>Low (${history[history.length - 1].lowViolations})</span>
                <div class="violation-bar low" style="width: ${this.getViolationWidth(history[history.length - 1].lowViolations, history[history.length - 1])}%"></div>
            </div>
        </div>
        
        <div class="chart">
            <h3>Compliance History (Last ${Math.min(history.length, 10)} Scans)</h3>
            <table class="history-table">
                <thead>
                    <tr>
                        <th>Date/Time</th>
                        <th>Score</th>
                        <th>Level</th>
                        <th>Critical</th>
                        <th>High</th>
                        <th>Medium</th>
                        <th>Low</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.slice(-10).reverse().map(entry => `
                    <tr>
                        <td><div class="timestamp">${new Date(entry.timestamp).toLocaleString()}</div>${new Date(entry.timestamp).toLocaleDateString()}<br>${new Date(entry.timestamp).toLocaleTimeString()}</td>
                        <td>${entry.percentage}%</td>
                        <td>${entry.level}</td>
                        <td>${entry.criticalViolations}</td>
                        <td>${entry.highViolations}</td>
                        <td>${entry.mediumViolations}</td>
                        <td>${entry.lowViolations}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        
        <div class="chart">
            <h3>Recommendations</h3>
            <ul>
                <li>Address all critical policy violations immediately</li>
                <li>Review high severity violations and create improvement plan</li>
                <li>Schedule regular policy compliance reviews</li>
                <li>Integrate policy checks into CI/CD pipeline</li>
                <li>Provide policy training for development team</li>
            </ul>
        </div>
    </div>
</body>
</html>
    `;
    
    const dashboardFile = path.join(this.reportsDir, 'compliance-dashboard.html');
    fs.writeFileSync(dashboardFile, dashboardHTML);
    
    console.log(`🌐 Generated compliance dashboard: ${dashboardFile}`);
  }

  /**
   * Helper methods for dashboard generation
   */
  getTrendClass(history) {
    if (history.length < 2) return 'trend-stable';
    
    const current = history[history.length - 1].percentage;
    const previous = history[history.length - 2].percentage;
    
    if (current > previous) return 'trend-up';
    if (current < previous) return 'trend-down';
    return 'trend-stable';
  }

  calculateTrend(history) {
    if (history.length < 2) return 0;
    
    const current = history[history.length - 1].percentage;
    const previous = history[history.length - 2].percentage;
    
    return (current - previous).toFixed(1);
  }

  calculateAverage(history) {
    const total = history.reduce((sum, entry) => sum + entry.percentage, 0);
    return total / history.length;
  }

  getViolationWidth(count, entry) {
    const total = entry.criticalViolations + entry.highViolations + entry.mediumViolations + entry.lowViolations;
    return total > 0 ? (count / total) * 100 : 0;
  }

  /**
   * Get system information for reports
   */
  getSystemInfo() {
    try {
      return {
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memoryUsage: process.memoryUsage(),
        cwd: process.cwd()
      };
    } catch (error) {
      return {
        timestamp: new Date().toISOString(),
        error: 'Could not collect system information'
      };
    }
  }

  /**
   * Generate policy conformance report
   */
  generateConformanceReport() {
    console.log('\n📋 Generating Policy Conformance Report...');
    
    // Load compliance history
    let history = [];
    if (fs.existsSync(this.historyFile)) {
      try {
        const historyContent = fs.readFileSync(this.historyFile, 'utf8');
        history = JSON.parse(historyContent);
      } catch (error) {
        console.error('Error loading compliance history:', error.message);
      }
    }
    
    if (history.length === 0) {
      console.log('No compliance history available');
      return;
    }
    
    // Calculate conformance metrics
    const totalScans = history.length;
    const compliantScans = history.filter(h => h.percentage >= 85).length;
    const conformanceRate = (compliantScans / totalScans) * 100;
    
    // Generate conformance report
    const conformanceReport = {
      period: {
        start: history[0].timestamp,
        end: history[history.length - 1].timestamp
      },
      totalScans: totalScans,
      compliantScans: compliantScans,
      conformanceRate: conformanceRate,
      averageCompliance: this.calculateAverage(history),
      trend: this.calculateTrend(history),
      policyCoverage: this.engine.policies.length,
      recommendations: this.generateRecommendations(history)
    };
    
    // Save conformance report
    const reportFile = path.join(this.reportsDir, 'policy-conformance-report.json');
    fs.writeFileSync(reportFile, JSON.stringify(conformanceReport, null, 2));
    
    console.log(`📊 Generated conformance report: ${reportFile}`);
    console.log(`   Conformance Rate: ${conformanceReport.conformanceRate.toFixed(1)}%`);
    console.log(`   Average Compliance: ${conformanceReport.averageCompliance.toFixed(1)}%`);
    console.log(`   Trend: ${conformanceReport.trend}%`);
  }

  /**
   * Generate recommendations based on compliance history
   */
  generateRecommendations(history) {
    const recommendations = [];
    const current = history[history.length - 1];
    
    if (current.criticalViolations > 0) {
      recommendations.push({
        priority: 'high',
        recommendation: 'Immediately address all critical policy violations',
        impact: 'Critical violations can lead to system failures or security issues'
      });
    }
    
    if (current.highViolations > 2) {
      recommendations.push({
        priority: 'high',
        recommendation: 'Review and address high severity policy violations',
        impact: 'High severity violations can affect system reliability and performance'
      });
    }
    
    if (current.percentage < 80) {
      recommendations.push({
        priority: 'medium',
        recommendation: 'Improve overall policy compliance',
        impact: 'Better compliance leads to more robust and maintainable code'
      });
    }
    
    if (this.calculateTrend(history) < -5) {
      recommendations.push({
        priority: 'medium',
        recommendation: 'Investigate declining compliance trend',
        impact: 'Declining compliance may indicate process or training issues'
      });
    }
    
    recommendations.push({
      priority: 'low',
      recommendation: 'Schedule regular policy compliance reviews',
      impact: 'Regular reviews help maintain high compliance standards'
    });
    
    return recommendations;
  }

  /**
   * Run continuous monitoring (simulated)
   */
  runContinuousMonitoring(intervalMinutes = 60) {
    console.log(`⏰ Starting continuous monitoring (every ${intervalMinutes} minutes)`);
    
    // In a real implementation, this would run periodically
    // For now, we'll just run one scan and show how it would work
    this.runComplianceScan();
    this.generateComplianceDashboard();
    this.generateConformanceReport();
    
    console.log('\n🎯 Monitoring complete. Reports generated.');
    console.log('   To run continuous monitoring, set up a cron job or scheduled task:');
    console.log('   node policy-monitoring.js --interval 60');
  }
}

// Main execution
const monitor = new PolicyMonitoringSystem();

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

if (command === '--help' || !command) {
  console.log('MCS Policy Monitoring System');
  console.log('Usage:');
  console.log('  node policy-monitoring.js scan          - Run compliance scan');
  console.log('  node policy-monitoring.js dashboard      - Generate compliance dashboard');
  console.log('  node policy-monitoring.js conformance    - Generate conformance report');
  console.log('  node policy-monitoring.js monitor        - Run continuous monitoring');
  console.log('  node policy-monitoring.js --help        - Show this help');
  process.exit(0);
}

switch (command) {
  case 'scan':
    monitor.runComplianceScan();
    break;
  case 'dashboard':
    monitor.generateComplianceDashboard();
    break;
  case 'conformance':
    monitor.generateConformanceReport();
    break;
  case 'monitor':
    const interval = args[1] ? parseInt(args[1]) : 60;
    monitor.runContinuousMonitoring(interval);
    break;
  default:
    console.log(`Unknown command: ${command}`);
    process.exit(1);
}

// Export for use in other scripts
module.exports = { PolicyMonitoringSystem };