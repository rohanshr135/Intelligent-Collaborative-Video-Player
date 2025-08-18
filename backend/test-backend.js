#!/usr/bin/env node

/**
 * Comprehensive Backend Testing and Error Detection Script
 * This script performs TDD-style testing and error detection for the entire backend
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

class BackendTester {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.passedTests = 0;
    this.failedTests = 0;
  }

  log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m',   // Red
      reset: '\x1b[0m'     // Reset
    };

    console.log(`${colors[type]}${message}${colors.reset}`);
  }

  async runCommand(command, description) {
    this.log(`\n🔍 ${description}...`, 'info');
    
    try {
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr && !stderr.includes('warning') && !stderr.includes('deprecated')) {
        this.warnings.push(`${description}: ${stderr.trim()}`);
        this.log(`⚠️  Warning: ${stderr.trim()}`, 'warning');
      }
      
      this.log(`✅ ${description} completed`, 'success');
      return { success: true, output: stdout, error: stderr };
    } catch (error) {
      this.errors.push(`${description}: ${error.message}`);
      this.log(`❌ ${description} failed: ${error.message}`, 'error');
      return { success: false, output: '', error: error.message };
    }
  }

  async checkFileStructure() {
    this.log('\n📁 Checking file structure...', 'info');
    
    const requiredFiles = [
      'src/config/env.js',
      'src/utils/redis.js',
      'src/middleware/auth.js',
      'src/models/User.js',
      'src/server.js',
      'package.json',
      'jest.config.json',
      '.env',
      '.env.example'
    ];

    const requiredDirs = [
      'src',
      'src/config',
      'src/utils',
      'src/middleware',
      'src/models',
      'src/routes',
      'src/services',
      'tests',
      'tests/unit',
      'tests/integration'
    ];

    for (const file of requiredFiles) {
      try {
        await fs.access(file);
        this.log(`✅ ${file} exists`, 'success');
      } catch {
        this.errors.push(`Missing required file: ${file}`);
        this.log(`❌ Missing: ${file}`, 'error');
      }
    }

    for (const dir of requiredDirs) {
      try {
        await fs.access(dir);
        this.log(`✅ ${dir}/ directory exists`, 'success');
      } catch {
        this.errors.push(`Missing required directory: ${dir}`);
        this.log(`❌ Missing directory: ${dir}/`, 'error');
      }
    }
  }

  async checkSyntax() {
    this.log('\n🔍 Checking JavaScript syntax...', 'info');
    
    const jsFiles = [
      'src/config/env.js',
      'src/utils/redis.js',
      'src/middleware/auth.js',
      'src/models/User.js',
      'src/server.js'
    ];

    for (const file of jsFiles) {
      try {
        await fs.access(file);
        const result = await this.runCommand(`node --check ${file}`, `Syntax check for ${file}`);
        if (result.success) {
          this.passedTests++;
        } else {
          this.failedTests++;
        }
      } catch {
        this.log(`⚠️  Skipping syntax check for ${file} (file not found)`, 'warning');
      }
    }
  }

  async checkImports() {
    this.log('\n📦 Checking module imports...', 'info');
    
    const importTests = [
      {
        description: 'Environment configuration',
        test: `node --input-type=module -e "import { config, validateConfig } from './src/config/env.js'; console.log('Config imported successfully');"`
      },
      {
        description: 'Redis utilities',
        test: `node --input-type=module -e "import redisManager from './src/utils/redis.js'; console.log('Redis manager imported successfully');"`
      },
      {
        description: 'Authentication middleware',
        test: `node --input-type=module -e "import { hashPassword } from './src/middleware/auth.js'; console.log('Auth middleware imported successfully');"`
      },
      {
        description: 'User model',
        test: `node --input-type=module -e "import { User } from './src/models/User.js'; console.log('User model imported successfully');"`
      }
    ];

    for (const test of importTests) {
      const result = await this.runCommand(test.test, test.description);
      if (result.success) {
        this.passedTests++;
      } else {
        this.failedTests++;
      }
    }
  }

  async checkConfiguration() {
    this.log('\n⚙️  Checking configuration...', 'info');
    
    const configTests = [
      {
        description: 'Configuration validation',
        test: `node --input-type=module -e "import { validateConfig } from './src/config/env.js'; validateConfig(); console.log('Configuration valid');"`
      },
      {
        description: 'Environment variables loaded',
        test: `node --input-type=module -e "import { config } from './src/config/env.js'; console.log('JWT Secret:', config.jwt.secret ? 'CONFIGURED' : 'MISSING'); console.log('MongoDB URI:', config.mongoUri ? 'CONFIGURED' : 'MISSING');"`
      }
    ];

    for (const test of configTests) {
      const result = await this.runCommand(test.test, test.description);
      if (result.success) {
        this.passedTests++;
      } else {
        this.failedTests++;
      }
    }
  }

  async runUnitTests() {
    this.log('\n🧪 Running unit tests...', 'info');
    
    const result = await this.runCommand(
      'npm run test:unit -- --passWithNoTests',
      'Unit tests execution'
    );
    
    if (result.success) {
      this.passedTests++;
      this.log('Unit tests passed', 'success');
    } else {
      this.failedTests++;
      this.log('Unit tests failed', 'error');
    }
  }

  async runIntegrationTests() {
    this.log('\n🔗 Running integration tests...', 'info');
    
    const result = await this.runCommand(
      'npm run test:integration -- --passWithNoTests',
      'Integration tests execution'
    );
    
    if (result.success) {
      this.passedTests++;
      this.log('Integration tests passed', 'success');
    } else {
      this.failedTests++;
      this.log('Integration tests failed', 'error');
    }
  }

  async checkDependencies() {
    this.log('\n📚 Checking dependencies...', 'info');
    
    const result = await this.runCommand('npm ls --depth=0', 'Dependency check');
    
    if (result.success) {
      this.passedTests++;
    } else {
      this.failedTests++;
    }
  }

  async checkLinting() {
    this.log('\n🔍 Running linter...', 'info');
    
    // Check if eslint config exists
    try {
      await fs.access('eslint.config.js');
    } catch {
      this.log('⚠️  ESLint config not found, skipping lint check', 'warning');
      return;
    }
    
    const result = await this.runCommand('npm run lint', 'Code linting');
    
    if (result.success) {
      this.passedTests++;
    } else {
      this.failedTests++;
    }
  }

  async checkCodeCoverage() {
    this.log('\n📊 Checking test coverage...', 'info');
    
    const result = await this.runCommand(
      'npm run test:coverage -- --passWithNoTests --silent',
      'Test coverage analysis'
    );
    
    if (result.success) {
      this.passedTests++;
    } else {
      this.failedTests++;
    }
  }

  async performSecurityCheck() {
    this.log('\n🔒 Security check...', 'info');
    
    // Check for common security issues
    const securityTests = [
      {
        description: 'Environment variables not exposed',
        test: `node --input-type=module -e "import { getSecureConfig } from './src/config/env.js'; const str = JSON.stringify(getSecureConfig()); if (str.includes(process.env.JWT_SECRET)) throw new Error('JWT secret exposed'); console.log('Environment variables properly protected');"`
      },
      {
        description: 'Password hashing works',
        test: `node --input-type=module -e "import { hashPassword } from './src/middleware/auth.js'; const hash = await hashPassword('test'); if (!hash.startsWith('$2')) throw new Error('Password hashing failed'); console.log('Password hashing working');"`
      }
    ];

    for (const test of securityTests) {
      const result = await this.runCommand(test.test, test.description);
      if (result.success) {
        this.passedTests++;
      } else {
        this.failedTests++;
      }
    }
  }

  async generateReport() {
    this.log('\n📋 Generating test report...', 'info');
    
    const totalTests = this.passedTests + this.failedTests;
    const successRate = totalTests > 0 ? (this.passedTests / totalTests * 100).toFixed(1) : 0;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalTests,
        passedTests: this.passedTests,
        failedTests: this.failedTests,
        successRate: `${successRate}%`,
        totalErrors: this.errors.length,
        totalWarnings: this.warnings.length
      },
      errors: this.errors,
      warnings: this.warnings
    };

    // Write report to file
    await fs.writeFile('test-report.json', JSON.stringify(report, null, 2));
    
    this.log('\n🎯 TEST SUMMARY', 'info');
    this.log('═'.repeat(50), 'info');
    this.log(`✅ Passed Tests: ${this.passedTests}`, 'success');
    this.log(`❌ Failed Tests: ${this.failedTests}`, 'error');
    this.log(`⚠️  Warnings: ${this.warnings.length}`, 'warning');
    this.log(`🚨 Errors: ${this.errors.length}`, 'error');
    this.log(`📊 Success Rate: ${successRate}%`, successRate >= 80 ? 'success' : 'error');
    this.log('═'.repeat(50), 'info');

    if (this.errors.length > 0) {
      this.log('\n🚨 ERRORS FOUND:', 'error');
      this.errors.forEach((error, index) => {
        this.log(`${index + 1}. ${error}`, 'error');
      });
    }

    if (this.warnings.length > 0) {
      this.log('\n⚠️  WARNINGS:', 'warning');
      this.warnings.forEach((warning, index) => {
        this.log(`${index + 1}. ${warning}`, 'warning');
      });
    }

    this.log(`\n📄 Detailed report saved to: test-report.json`, 'info');
    
    return this.errors.length === 0 && this.failedTests === 0;
  }

  async runAllTests() {
    this.log('🚀 Starting comprehensive backend testing...', 'info');
    this.log('═'.repeat(60), 'info');

    await this.checkFileStructure();
    await this.checkSyntax();
    await this.checkImports();
    await this.checkConfiguration();
    await this.checkDependencies();
    await this.checkLinting();
    await this.runUnitTests();
    await this.runIntegrationTests();
    await this.checkCodeCoverage();
    await this.performSecurityCheck();
    
    const success = await this.generateReport();
    
    if (success) {
      this.log('\n🎉 All tests passed! Backend is error-free.', 'success');
      process.exit(0);
    } else {
      this.log('\n💥 Tests failed! Please fix the errors above.', 'error');
      process.exit(1);
    }
  }
}

// Run the tests
const tester = new BackendTester();
tester.runAllTests().catch(error => {
  console.error('🚨 Test runner crashed:', error);
  process.exit(1);
});
