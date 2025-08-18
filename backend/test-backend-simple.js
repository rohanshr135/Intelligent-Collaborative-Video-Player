#!/usr/bin/env node
/**
 * Simplified Backend Testing Script
 * Tests backend without MongoDB Memory Server to avoid AVX issues
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SimpleBackendTester {
  constructor() {
    this.results = {
      timestamp: new Date().toISOString(),
      passed: 0,
      failed: 0,
      total: 0,
      errors: [],
      warnings: []
    };
  }

  log(message, type = 'info') {
    const prefix = {
      info: '🔍',
      success: '✅',
      error: '❌',
      warning: '⚠️'
    }[type];
    console.log(`${prefix} ${message}`);
  }

  async checkFileStructure() {
    this.log('Checking file structure...', 'info');
    const requiredFiles = [
      'src/server.js',
      'src/config/env.js',
      'src/middleware/auth.js',
      'src/middleware/rateLimit.js',
      'src/models/User.js',
      'src/utils/logger.js',
      'package.json'
    ];

    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        this.results.passed++;
        this.log(`File exists: ${file}`, 'success');
      } else {
        this.results.failed++;
        this.results.errors.push(`Missing file: ${file}`);
        this.log(`Missing file: ${file}`, 'error');
      }
      this.results.total++;
    }
  }

  async checkSyntax() {
    this.log('Checking syntax...', 'info');
    const jsFiles = [
      'src/server.js',
      'src/config/env.js',
      'src/middleware/auth.js',
      'src/middleware/rateLimit.js',
      'src/models/User.js',
      'src/utils/logger.js'
    ];

    for (const file of jsFiles) {
      const filePath = path.join(__dirname, file);
      if (fs.existsSync(filePath)) {
        try {
          await import(filePath);
          this.results.passed++;
          this.log(`Syntax OK: ${file}`, 'success');
        } catch (error) {
          this.results.failed++;
          this.results.errors.push(`Syntax error in ${file}: ${error.message}`);
          this.log(`Syntax error in ${file}: ${error.message}`, 'error');
        }
        this.results.total++;
      }
    }
  }

  async checkConfigValidation() {
    this.log('Checking configuration...', 'info');
    try {
      // Set test environment
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'test-secret';
      process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
      process.env.MONGODB_URI = 'mongodb://localhost:27017/test';

      const { config } = await import('./src/config/env.js');
      
      if (config.jwt && config.jwt.secret) {
        this.results.passed++;
        this.log('JWT configuration loaded', 'success');
      } else {
        this.results.failed++;
        this.results.errors.push('JWT configuration missing');
        this.log('JWT configuration missing', 'error');
      }
      this.results.total++;

      if (config.mongoUri) {
        this.results.passed++;
        this.log('Database configuration loaded', 'success');
      } else {
        this.results.failed++;
        this.results.errors.push('Database configuration missing');
        this.log('Database configuration missing', 'error');
      }
      this.results.total++;

    } catch (error) {
      this.results.failed += 2;
      this.results.total += 2;
      this.results.errors.push(`Configuration error: ${error.message}`);
      this.log(`Configuration error: ${error.message}`, 'error');
    }
  }

  async checkMiddleware() {
    this.log('Checking middleware exports...', 'info');
    try {
      const authModule = await import('./src/middleware/auth.js');
      const expectedExports = ['requireAuth', 'hashPassword', 'generateTokens'];
      
      for (const exportName of expectedExports) {
        if (authModule[exportName]) {
          this.results.passed++;
          this.log(`Auth middleware export OK: ${exportName}`, 'success');
        } else {
          this.results.failed++;
          this.results.errors.push(`Missing auth export: ${exportName}`);
          this.log(`Missing auth export: ${exportName}`, 'error');
        }
        this.results.total++;
      }

    } catch (error) {
      this.results.failed += 3;
      this.results.total += 3;
      this.results.errors.push(`Middleware error: ${error.message}`);
      this.log(`Middleware error: ${error.message}`, 'error');
    }
  }

  async checkPackageJson() {
    this.log('Checking package.json...', 'info');
    try {
      const packagePath = path.join(__dirname, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      const requiredDeps = ['express', 'mongoose', 'jsonwebtoken', 'bcryptjs'];
      for (const dep of requiredDeps) {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
          this.results.passed++;
          this.log(`Dependency OK: ${dep}`, 'success');
        } else {
          this.results.failed++;
          this.results.errors.push(`Missing dependency: ${dep}`);
          this.log(`Missing dependency: ${dep}`, 'error');
        }
        this.results.total++;
      }

    } catch (error) {
      this.results.failed += 4;
      this.results.total += 4;
      this.results.errors.push(`Package.json error: ${error.message}`);
      this.log(`Package.json error: ${error.message}`, 'error');
    }
  }

  async checkEnvironmentVariables() {
    this.log('Checking environment variables...', 'info');
    const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'MONGODB_URI'];
    
    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        this.results.passed++;
        this.log(`Environment variable OK: ${envVar}`, 'success');
      } else {
        this.results.warnings.push(`Missing environment variable: ${envVar}`);
        this.log(`Missing environment variable: ${envVar}`, 'warning');
      }
      this.results.total++;
    }
  }

  async generateReport() {
    const report = {
      ...this.results,
      summary: {
        success_rate: ((this.results.passed / this.results.total) * 100).toFixed(2) + '%',
        status: this.results.failed === 0 ? 'PASS' : 'FAIL'
      }
    };

    fs.writeFileSync('simple-test-report.json', JSON.stringify(report, null, 2));
    
    this.log('\n📊 Test Summary:', 'info');
    this.log(`Total Tests: ${this.results.total}`, 'info');
    this.log(`Passed: ${this.results.passed}`, 'success');
    this.log(`Failed: ${this.results.failed}`, 'error');
    this.log(`Warnings: ${this.results.warnings.length}`, 'warning');
    this.log(`Success Rate: ${report.summary.success_rate}`, 'info');
    
    if (this.results.errors.length > 0) {
      this.log('\n❌ ERRORS:', 'error');
      this.results.errors.forEach(error => this.log(`  • ${error}`, 'error'));
    }
    
    if (this.results.warnings.length > 0) {
      this.log('\n⚠️  WARNINGS:', 'warning');
      this.results.warnings.forEach(warning => this.log(`  • ${warning}`, 'warning'));
    }

    this.log(`\n📄 Detailed report saved to: simple-test-report.json`, 'info');
    
    return report.summary.status === 'PASS';
  }

  async runAllTests() {
    this.log('🚀 Starting simplified backend tests...', 'info');
    
    await this.checkFileStructure();
    await this.checkSyntax();
    await this.checkConfigValidation();
    await this.checkMiddleware();
    await this.checkPackageJson();
    await this.checkEnvironmentVariables();
    
    const success = await this.generateReport();
    
    if (success) {
      this.log('\n🎉 All tests passed!', 'success');
      process.exit(0);
    } else {
      this.log('\n💥 Tests failed! Please fix the errors above.', 'error');
      process.exit(1);
    }
  }
}

// Run tests
const tester = new SimpleBackendTester();
tester.runAllTests().catch(error => {
  console.error('❌ Test runner error:', error);
  process.exit(1);
});
