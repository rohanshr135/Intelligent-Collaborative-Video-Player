import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';

console.log('Loading Gemini service...');
console.log('API key available:', !!config.api.gemini);

// Initialize Gemini AI with configuration
const genAI = config.api.gemini ? new GoogleGenerativeAI(config.api.gemini) : null;

console.log('genAI initialized:', !!genAI);

if (!config.api.gemini) {
  console.warn('Gemini API key not configured. AI features will be disabled.');
}

export default genAI;
