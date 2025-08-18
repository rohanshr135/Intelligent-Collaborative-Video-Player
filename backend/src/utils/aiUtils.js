import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import logger from './logger.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

/**
 * AI utility functions for text processing, summarization, and transcription
 * Supports multiple AI providers (OpenAI, Google AI)
 */
export class AIUtils {
  constructor() {
    // Initialize AI clients
    this.openai = null;
    this.googleAI = null;
    
    this.initializeClients();
    
    // Configuration
    this.maxTokens = {
      summary: 200,
      transcript: 1000,
      analysis: 500
    };
    
    this.retryOptions = {
      maxRetries: 3,
      retryDelay: 1000
    };
  }

  /**
   * Initialize AI service clients
   */
  initializeClients() {
    try {
      // Initialize OpenAI client
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        });
        logger.info('OpenAI client initialized');
      }

      // Initialize Google AI client
      if (process.env.GOOGLE_AI_API_KEY) {
        this.googleAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
        logger.info('Google AI client initialized');
      }

      if (!this.openai && !this.googleAI) {
        logger.warn('No AI service API keys found. AI features will be disabled.');
      }
    } catch (error) {
      logger.error('Failed to initialize AI clients:', error);
    }
  }

  /**
   * Summarize transcript text with contextual awareness
   * @param {string} transcriptText - full transcript to summarize
   * @param {Object} options - summarization options
   * @returns {Promise<string>} summary text
   */
  async summarizeTranscript(transcriptText, options = {}) {
    const {
      maxLength = 150,
      style = 'concise', // 'concise', 'detailed', 'bullet-points'
      language = 'en',
      contextType = 'general', // 'educational', 'entertainment', 'business'
      includeKeywords = false
    } = options;

    try {
      if (!transcriptText || transcriptText.trim().length === 0) {
        throw new Error('No transcript text provided');
      }

      // Prepare the prompt based on style and context
      const prompt = this.buildSummaryPrompt(transcriptText, {
        maxLength,
        style,
        language,
        contextType,
        includeKeywords
      });

      let summary;

      // Try OpenAI first, fallback to Google AI
      if (this.openai) {
        summary = await this.summarizeWithOpenAI(prompt, maxLength);
      } else if (this.googleAI) {
        summary = await this.summarizeWithGoogleAI(prompt, maxLength);
      } else {
        throw new Error('No AI service available for summarization');
      }

      logger.info('Transcript summarized successfully:', {
        originalLength: transcriptText.length,
        summaryLength: summary.length,
        style,
        contextType
      });

      return summary;
    } catch (error) {
      logger.error('Transcript summarization failed:', {
        error: error.message,
        transcriptLength: transcriptText?.length || 0,
        options
      });
      throw new Error(`Summarization failed: ${error.message}`);
    }
  }

  /**
   * Build context-appropriate summary prompt
   * @param {string} text - text to summarize
   * @param {Object} options - prompt options
   * @returns {string} formatted prompt
   */
  buildSummaryPrompt(text, options) {
    const { maxLength, style, language, contextType, includeKeywords } = options;

    let basePrompt = '';
    
    switch (style) {
      case 'bullet-points':
        basePrompt = `Create a bullet-point summary of the following transcript. Focus on key points and main ideas:`;
        break;
      case 'detailed':
        basePrompt = `Provide a detailed summary of the following transcript, including main topics, important details, and conclusions:`;
        break;
      case 'concise':
      default:
        basePrompt = `Summarize the following transcript concisely, capturing the main message and key points:`;
        break;
    }

    // Add context-specific instructions
    switch (contextType) {
      case 'educational':
        basePrompt += ` Focus on learning objectives, key concepts, and important information for students.`;
        break;
      case 'entertainment':
        basePrompt += ` Highlight interesting moments, main themes, and engaging content.`;
        break;
      case 'business':
        basePrompt += ` Emphasize decisions, action items, key discussions, and outcomes.`;
        break;
    }

    // Add keyword extraction if requested
    if (includeKeywords) {
      basePrompt += ` Include a list of key terms and topics mentioned.`;
    }

    // Add length constraint
    basePrompt += ` Keep the summary under ${maxLength} words.`;

    // Add language specification if not English
    if (language !== 'en') {
      basePrompt += ` Respond in ${language}.`;
    }

    return `${basePrompt}\n\nTranscript:\n${text}`;
  }

  /**
   * Summarize using OpenAI
   * @param {string} prompt - formatted prompt
   * @param {number} maxLength - maximum response length
   * @returns {Promise<string>} summary
   */
  async summarizeWithOpenAI(prompt, maxLength) {
    const response = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that creates clear, informative summaries of video content.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: Math.min(maxLength * 2, this.maxTokens.summary),
      temperature: 0.3,
      presence_penalty: 0.1
    });

    return response.choices[0].message.content.trim();
  }

  /**
   * Summarize using Google AI
   * @param {string} prompt - formatted prompt
   * @param {number} maxLength - maximum response length
   * @returns {Promise<string>} summary
   */
  async summarizeWithGoogleAI(prompt, maxLength) {
    const model = this.googleAI.getGenerativeModel({ model: 'gemini-pro' });
    
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: Math.min(maxLength * 2, this.maxTokens.summary),
        temperature: 0.3
      }
    });

    const response = await result.response;
    return response.text().trim();
  }

  /**
   * Extract key topics and themes from transcript
   * @param {string} transcriptText - transcript to analyze
   * @param {Object} options - analysis options
   * @returns {Promise<Object>} analysis results
   */
  async analyzeTranscriptTopics(transcriptText, options = {}) {
    const {
      maxTopics = 5,
      includeTimestamps = false,
      language = 'en'
    } = options;

    try {
      const prompt = `Analyze the following transcript and extract the main topics and themes. 
      Provide up to ${maxTopics} key topics, each with a brief description.
      Format as JSON with topics array containing objects with 'topic' and 'description' fields.
      ${includeTimestamps ? 'If timestamps are present, include them in the analysis.' : ''}
      
      Transcript:
      ${transcriptText}`;

      let analysis;

      if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an expert content analyst. Respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.maxTokens.analysis,
          temperature: 0.2
        });

        analysis = JSON.parse(response.choices[0].message.content.trim());
      } else if (this.googleAI) {
        const model = this.googleAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        analysis = JSON.parse(response.text().trim());
      } else {
        throw new Error('No AI service available');
      }

      logger.info('Transcript topics analyzed:', {
        topicCount: analysis.topics?.length || 0,
        transcriptLength: transcriptText.length
      });

      return analysis;
    } catch (error) {
      logger.error('Topic analysis failed:', {
        error: error.message,
        transcriptLength: transcriptText?.length || 0
      });
      throw new Error(`Topic analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate chapter markers based on content analysis
   * @param {string} transcriptText - transcript with timestamps
   * @param {Object} options - chapter generation options
   * @returns {Promise<Array>} array of chapter objects
   */
  async generateChapters(transcriptText, options = {}) {
    const {
      maxChapters = 10,
      minChapterLength = 60, // seconds
      includeDescriptions = true
    } = options;

    try {
      const prompt = `Analyze this timestamped transcript and create chapter markers for video navigation.
      Generate up to ${maxChapters} chapters, each at least ${minChapterLength} seconds long.
      ${includeDescriptions ? 'Include brief descriptions for each chapter.' : ''}
      
      Format as JSON array with objects containing:
      - timestamp: time in seconds
      - title: chapter title
      ${includeDescriptions ? '- description: brief chapter description' : ''}
      
      Transcript:
      ${transcriptText}`;

      let chapters;

      if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You create helpful chapter markers for video content. Respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: this.maxTokens.analysis,
          temperature: 0.2
        });

        chapters = JSON.parse(response.choices[0].message.content.trim());
      } else if (this.googleAI) {
        const model = this.googleAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        chapters = JSON.parse(response.text().trim());
      } else {
        throw new Error('No AI service available');
      }

      // Validate and sort chapters
      if (Array.isArray(chapters)) {
        chapters = chapters
          .filter(chapter => chapter.timestamp && chapter.title)
          .sort((a, b) => a.timestamp - b.timestamp);
      }

      logger.info('Chapters generated:', {
        chapterCount: chapters?.length || 0,
        transcriptLength: transcriptText.length
      });

      return chapters || [];
    } catch (error) {
      logger.error('Chapter generation failed:', {
        error: error.message,
        transcriptLength: transcriptText?.length || 0
      });
      throw new Error(`Chapter generation failed: ${error.message}`);
    }
  }

  /**
   * Transcribe audio using Whisper API (placeholder for actual implementation)
   * @param {Buffer|string} audioInput - audio buffer or file path
   * @param {Object} options - transcription options
   * @returns {Promise<Object>} transcription result
   */
  async transcribeAudio(audioInput, options = {}) {
    const {
      language = 'en',
      format = 'text', // 'text', 'srt', 'vtt'
      includeTimestamps = true,
      wordLevelTimestamps = false
    } = options;

    try {
      if (!this.openai) {
        throw new Error('OpenAI API key required for transcription');
      }

      let audioFile;
      
      // Handle different input types
      if (Buffer.isBuffer(audioInput)) {
        // Create temporary file from buffer
        const tempPath = path.join(process.cwd(), 'temp', `audio_${Date.now()}.wav`);
        await fs.promises.writeFile(tempPath, audioInput);
        audioFile = fs.createReadStream(tempPath);
      } else if (typeof audioInput === 'string') {
        // File path provided
        audioFile = fs.createReadStream(audioInput);
      } else {
        throw new Error('Invalid audio input format');
      }

      const transcription = await this.openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: language,
        response_format: format === 'text' ? 'text' : format,
        timestamp_granularities: wordLevelTimestamps ? ['word'] : ['segment']
      });

      logger.info('Audio transcribed successfully:', {
        language,
        format,
        includeTimestamps,
        wordLevelTimestamps
      });

      return {
        text: transcription.text || transcription,
        segments: transcription.segments || null,
        words: transcription.words || null,
        language: transcription.language || language
      };
    } catch (error) {
      logger.error('Audio transcription failed:', {
        error: error.message,
        audioInputType: typeof audioInput,
        options
      });
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Generate video description based on metadata and transcript
   * @param {Object} videoMetadata - video metadata object
   * @param {string} transcript - video transcript (optional)
   * @param {Object} options - generation options
   * @returns {Promise<string>} generated description
   */
  async generateVideoDescription(videoMetadata, transcript = '', options = {}) {
    const {
      style = 'informative', // 'informative', 'engaging', 'professional'
      maxLength = 300,
      includeMetadata = true,
      language = 'en'
    } = options;

    try {
      let prompt = `Generate a compelling video description based on the following information:\n\n`;
      
      if (includeMetadata) {
        prompt += `Video Details:
- Duration: ${videoMetadata.duration ? Math.round(videoMetadata.duration) : 'Unknown'} seconds
- Resolution: ${videoMetadata.resolution || 'Unknown'}
- Format: ${videoMetadata.format || 'Unknown'}\n\n`;
      }

      if (transcript) {
        prompt += `Transcript Summary:\n${transcript}\n\n`;
      }

      prompt += `Create a ${style} description that would attract viewers and accurately represent the content. `;
      prompt += `Keep it under ${maxLength} characters.`;

      if (language !== 'en') {
        prompt += ` Write in ${language}.`;
      }

      let description;

      if (this.openai) {
        const response = await this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a creative writer specializing in video descriptions that engage audiences.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: Math.min(maxLength, this.maxTokens.summary),
          temperature: 0.7
        });

        description = response.choices[0].message.content.trim();
      } else if (this.googleAI) {
        const model = this.googleAI.getGenerativeModel({ model: 'gemini-pro' });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        description = response.text().trim();
      } else {
        throw new Error('No AI service available');
      }

      logger.info('Video description generated:', {
        descriptionLength: description.length,
        style,
        includeMetadata,
        hasTranscript: !!transcript
      });

      return description;
    } catch (error) {
      logger.error('Video description generation failed:', {
        error: error.message,
        videoMetadata: !!videoMetadata,
        transcriptLength: transcript?.length || 0
      });
      throw new Error(`Description generation failed: ${error.message}`);
    }
  }

  /**
   * Check if AI services are available
   * @returns {Object} availability status
   */
  getServiceStatus() {
    return {
      openai: !!this.openai,
      googleAI: !!this.googleAI,
      anyAvailable: !!(this.openai || this.googleAI)
    };
  }

  /**
   * Retry mechanism for AI API calls
   * @param {Function} operation - async operation to retry
   * @param {number} maxRetries - maximum retry attempts
   * @returns {Promise} operation result
   */
  async retryOperation(operation, maxRetries = this.retryOptions.maxRetries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Wait before retrying
        await new Promise(resolve => 
          setTimeout(resolve, this.retryOptions.retryDelay * attempt)
        );
        
        logger.warn(`AI operation attempt ${attempt} failed, retrying...`, {
          error: error.message,
          attempt,
          maxRetries
        });
      }
    }
    
    throw lastError;
  }
}

// Create singleton instance
const aiUtils = new AIUtils();

export default aiUtils;

// Export individual functions for convenience
export const {
  summarizeTranscript,
  analyzeTranscriptTopics,
  generateChapters,
  transcribeAudio,
  generateVideoDescription,
  getServiceStatus
} = aiUtils;
