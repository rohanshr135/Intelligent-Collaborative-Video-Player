#!/usr/bin/env node

console.log('🔍 Quick Backend Export Test');
console.log('============================');

async function testAnalyticsExports() {
  try {
    console.log('Testing analytics controller exports...');
    const analytics = await import('./src/controllers/analyticsController.js');
    const exports = Object.keys(analytics);
    console.log(`✅ Analytics controller exports: ${exports.length} functions`);
    
    const required = [
      'getViewHistory',
      'getEngagementAnalytics', 
      'getPopularityAnalytics',
      'getPerformanceAnalytics',
      'getUserAnalytics',
      'getVideoAnalytics',
      'getSyncAnalytics',
      'getBranchingAnalytics',
      'getAIAnalytics',
      'getSystemAnalytics',
      'generateReport',
      'getReports',
      'scheduleReport',
      'getDashboardData'
    ];
    
    const missing = required.filter(fn => !exports.includes(fn));
    if (missing.length === 0) {
      console.log('✅ All required analytics functions exported');
      return true;
    } else {
      console.log('❌ Missing exports:', missing);
      return false;
    }
  } catch (error) {
    console.log('❌ Analytics import error:', error.message);
    return false;
  }
}

async function testModelExports() {
  try {
    console.log('Testing model exports...');
    const models = await import('./src/models/index.js');
    const exports = Object.keys(models);
    console.log(`✅ Model index exports: ${exports.length} items`);
    
    const requiredModels = [
      'User', 'Video', 'SyncSession', 'SyncParticipant', 
      'BranchingVideo', 'UserChoice', 'SceneMarker'
    ];
    
    const missing = requiredModels.filter(model => !exports.includes(model));
    if (missing.length === 0) {
      console.log('✅ All required models exported');
      return true;
    } else {
      console.log('❌ Missing model exports:', missing);
      return false;
    }
  } catch (error) {
    console.log('❌ Model import error:', error.message);
    return false;
  }
}

async function testServerImport() {
  try {
    console.log('Testing server import...');
    await import('./src/server.js');
    console.log('✅ Server imports successfully');
    return true;
  } catch (error) {
    console.log('❌ Server import error:', error.message);
    if (error.message.includes('rateLimit')) {
      console.log('🔍 This appears to be a rateLimit reference issue');
    }
    return false;
  }
}

async function testAnalyticsRoutes() {
  try {
    console.log('Testing analytics routes import...');
    await import('./src/routes/analyticsRoutes.js');
    console.log('✅ Analytics routes import successfully');
    return true;
  } catch (error) {
    console.log('❌ Analytics routes import error:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('');
  
  const analyticsOk = await testAnalyticsExports();
  console.log('');
  
  const modelsOk = await testModelExports();
  console.log('');
  
  const routesOk = await testAnalyticsRoutes();
  console.log('');
  
  const serverOk = await testServerImport();
  console.log('');
  
  console.log('📊 RESULTS:');
  console.log('===========');
  console.log(`Analytics Controller: ${analyticsOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Model Exports: ${modelsOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Analytics Routes: ${routesOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Server Import: ${serverOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (analyticsOk && modelsOk && routesOk && serverOk) {
    console.log('');
    console.log('🎉 ALL TESTS PASSED! Export issues resolved.');
    process.exit(0);
  } else {
    console.log('');
    console.log('💥 Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

runTests().catch(console.error);
