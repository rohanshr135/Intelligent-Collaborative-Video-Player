import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config/env.js';

// Initialize Gemini AI with configuration
const genAI = config.api.gemini ? new GoogleGenerativeAI(config.api.gemini) : null;

if (!config.api.gemini) {
  console.warn('Gemini API key not configured. AI features will be disabled.');
}

export default genAI;
