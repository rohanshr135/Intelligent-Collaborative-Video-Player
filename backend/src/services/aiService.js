import VideoTranscript from '../models/VideoTranscript.js';
import AISummary from '../models/AISummary.js';
import aiUtils from '../utils/aiUtils.js';
import generalUtils from '../utils/generalUtils.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const access = promisify(fs.access);

/**
 * AI Service - Handles AI-powered features like transcription, summarization, and content analysis
 */
export class AIService {
  constructor() {
    this.tempPath = process.env.TEMP_PATH || './temp/ai';
    this.transcriptCache = new Map(); // Cache for recent transcripts
    this.summaryCache = new Map(); // Cache for recent summaries
    this.processingQueue = new Map(); // Track processing jobs
    
    // Cache cleanup every hour
    setInterval(() => this.cleanupCache(), 60 * 60 * 1000);
    
    // Initialize temp directory
    this.initializeTempDirectory();
  }

  /**
   * Initialize temporary directory for AI processing
   */
  async initializeTempDirectory() {
    try {
      await access(this.tempPath);
    } catch {
      await fs.promises.mkdir(this.tempPath, { recursive: true });
      logger.info(`Created AI temp directory: ${this.tempPath}`);
    }
  }

  /**
   * Transcribe video audio using OpenAI Whisper
   * @param {String} videoId - video ID
   * @param {String} audioFilePath - path to audio file or video file
   * @param {Object} options - transcription options
   * @returns {Promise<Object>} transcript data
   */
  async transcribeVideo(videoId, audioFilePath, options = {}) {
    try {
      logger.info('Starting video transcription:', {
        videoId,
        audioFilePath,
        options
      });

      // Check if transcript already exists
      const existingTranscript = await VideoTranscript.findOne({ video: videoId });
      if (existingTranscript && !options.forceRetranscribe) {
        logger.info('Using existing transcript:', {
          videoId,
          transcriptId: existingTranscript._id
        });
        return existingTranscript;
      }

      // Check processing queue to avoid duplicate jobs
      const queueKey = `transcribe_${videoId}`;
      if (this.processingQueue.has(queueKey)) {
        logger.info('Transcription already in progress:', { videoId });
        throw new Error('Transcription already in progress for this video');
      }

      // Mark as processing
      this.processingQueue.set(queueKey, {
        startTime: new Date(),
        status: 'processing'
      });

      try {
        // Extract audio if input is video file
        let audioPath = audioFilePath;
        if (options.extractAudio) {
          audioPath = await this.extractAudioForTranscription(audioFilePath, videoId);
        }

        // Prepare transcription options
        const transcriptionOptions = {
          language: options.language || 'auto',
          prompt: options.prompt || '',
          temperature: options.temperature || 0,
          model: options.model || 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['word', 'segment']
        };

        // Call Whisper API
        const transcriptionResult = await aiUtils.transcribeAudio(
          audioPath,
          transcriptionOptions
        );

        // Process transcription result
        const processedTranscript = await this.processTranscriptionResult(
          transcriptionResult,
          videoId,
          options
        );

        // Save transcript to database
        const transcriptData = {
          video: videoId,
          transcriptText: processedTranscript.text,
          language: transcriptionResult.language || options.language || 'en',
          confidence: transcriptionResult.confidence || 0.9,
          
          // Detailed transcript data
          segments: processedTranscript.segments,
          words: processedTranscript.words,
          
          // Processing metadata
          model: transcriptionOptions.model,
          processingDuration: processedTranscript.processingTime,
          audioPath: audioPath !== audioFilePath ? audioPath : null,
          
          // Quality metrics
          wordCount: processedTranscript.wordCount,
          averageConfidence: processedTranscript.averageConfidence,
          
          // Timestamps
          generatedAt: new Date(),
          createdAt: new Date()
        };

        const transcript = new VideoTranscript(transcriptData);
        await transcript.save();

        // Cache transcript
        this.transcriptCache.set(videoId, transcript);

        // Clean up temporary audio file if created
        if (audioPath !== audioFilePath) {
          try {
            await fs.promises.unlink(audioPath);
          } catch (error) {
            logger.warn('Failed to cleanup temp audio file:', { audioPath, error });
          }
        }

        logger.info('Video transcription completed:', {
          videoId,
          transcriptId: transcript._id,
          wordCount: processedTranscript.wordCount,
          duration: processedTranscript.processingTime
        });

        return transcript;

      } finally {
        // Remove from processing queue
        this.processingQueue.delete(queueKey);
      }

    } catch (error) {
      logger.error('Video transcription failed:', {
        videoId,
        audioFilePath,
        error: error.message
      });
      throw new Error(`Transcription failed: ${error.message}`);
    }
  }

  /**
   * Generate AI summary for video content at specific timestamp
   * @param {String} videoId - video ID
   * @param {Number} timestamp - timestamp to summarize up to (seconds)
   * @param {Object} options - summarization options
   * @returns {Promise<Object>} summary data
   */
  async summarizeAtTimestamp(videoId, timestamp, options = {}) {
    try {
      logger.info('Generating summary at timestamp:', {
        videoId,
        timestamp,
        options
      });

      // Get transcript
      let transcript = this.transcriptCache.get(videoId);
      if (!transcript) {
        transcript = await VideoTranscript.findOne({ video: videoId });
        if (!transcript) {
          throw new Error('No transcript found for video. Please transcribe first.');
        }
        this.transcriptCache.set(videoId, transcript);
      }

      // Extract text up to timestamp
      const partialText = this.extractTextUpToTimestamp(
        transcript,
        timestamp,
        options
      );

      if (!partialText.trim()) {
        throw new Error('No content available for summarization at this timestamp');
      }

      // Check if summary already exists for this timestamp range
      const existingSummary = await AISummary.findOne({
        video: videoId,
        startTimestamp: 0,
        endTimestamp: timestamp,
        summaryType: options.summaryType || 'pause'
      });

      if (existingSummary && !options.forceRegenerate) {
        logger.info('Using existing summary:', {
          videoId,
          summaryId: existingSummary._id,
          timestamp
        });
        return existingSummary;
      }

      // Prepare summarization options
      const summaryOptions = {
        maxLength: options.maxLength || 200,
        style: options.style || 'concise',
        includeKeyPoints: options.includeKeyPoints !== false,
        includeTimestamps: options.includeTimestamps !== false,
        language: options.language || transcript.language || 'en',
        model: options.model || 'gpt-4o-mini'
      };

      // Generate summary using AI
      const summaryResult = await aiUtils.summarizeTranscript(
        partialText,
        summaryOptions
      );

      // Process summary result
      const processedSummary = await this.processSummaryResult(
        summaryResult,
        partialText,
        options
      );

      // Save summary to database
      const summaryData = {
        video: videoId,
        startTimestamp: 0,
        endTimestamp: timestamp,
        summaryText: processedSummary.text,
        summaryType: options.summaryType || 'pause',
        
        // AI processing details
        model: summaryOptions.model,
        prompt: summaryResult.prompt,
        tokensUsed: summaryResult.usage?.total_tokens || 0,
        
        // Content analysis
        keyPoints: processedSummary.keyPoints,
        topics: processedSummary.topics,
        sentiment: processedSummary.sentiment,
        
        // Quality metrics
        originalLength: partialText.length,
        summaryLength: processedSummary.text.length,
        compressionRatio: processedSummary.compressionRatio,
        
        // Timestamps
        generatedAt: new Date(),
        createdAt: new Date()
      };

      const summary = new AISummary(summaryData);
      await summary.save();

      // Cache summary
      const cacheKey = `${videoId}_${timestamp}`;
      this.summaryCache.set(cacheKey, summary);

      logger.info('Summary generated successfully:', {
        videoId,
        summaryId: summary._id,
        timestamp,
        tokensUsed: summaryData.tokensUsed,
        compressionRatio: processedSummary.compressionRatio
      });

      return summary;

    } catch (error) {
      logger.error('Summary generation failed:', {
        videoId,
        timestamp,
        error: error.message
      });
      throw new Error(`Summary generation failed: ${error.message}`);
    }
  }

  /**
   * Generate chapter markers using AI analysis
   * @param {String} videoId - video ID
   * @param {Object} options - chapter generation options
   * @returns {Promise<Array>} chapter markers
   */
  async generateChapters(videoId, options = {}) {
    try {
      logger.info('Generating AI chapters:', { videoId, options });

      // Get transcript
      let transcript = this.transcriptCache.get(videoId);
      if (!transcript) {
        transcript = await VideoTranscript.findOne({ video: videoId });
        if (!transcript) {
          throw new Error('No transcript found for video');
        }
        this.transcriptCache.set(videoId, transcript);
      }

      // Prepare chapter generation options
      const chapterOptions = {
        minChapterLength: options.minChapterLength || 60, // seconds
        maxChapters: options.maxChapters || 20,
        style: options.style || 'descriptive',
        includeTimestamps: true,
        model: options.model || 'gpt-4o-mini'
      };

      // Generate chapters using AI
      const chapters = await aiUtils.generateChapters(
        transcript.transcriptText,
        transcript.segments,
        chapterOptions
      );

      // Process and validate chapters
      const processedChapters = chapters.map((chapter, index) => ({
        id: generalUtils.generateUUID(),
        index: index + 1,
        title: chapter.title,
        description: chapter.description || '',
        startTime: chapter.startTime,
        endTime: chapter.endTime,
        duration: chapter.endTime - chapter.startTime,
        keyTopics: chapter.keyTopics || [],
        confidence: chapter.confidence || 0.8,
        createdAt: new Date()
      }));

      logger.info('AI chapters generated:', {
        videoId,
        chapterCount: processedChapters.length,
        totalDuration: processedChapters.reduce((sum, ch) => sum + ch.duration, 0)
      });

      return processedChapters;

    } catch (error) {
      logger.error('Chapter generation failed:', {
        videoId,
        error: error.message
      });
      throw new Error(`Chapter generation failed: ${error.message}`);
    }
  }

  /**
   * Analyze video content for topics and themes
   * @param {String} videoId - video ID
   * @param {Object} options - analysis options
   * @returns {Promise<Object>} content analysis
   */
  async analyzeVideoContent(videoId, options = {}) {
    try {
      logger.info('Analyzing video content:', { videoId, options });

      // Get transcript
      let transcript = this.transcriptCache.get(videoId);
      if (!transcript) {
        transcript = await VideoTranscript.findOne({ video: videoId });
        if (!transcript) {
          throw new Error('No transcript found for video');
        }
        this.transcriptCache.set(videoId, transcript);
      }

      // Prepare analysis options
      const analysisOptions = {
        analyzeTopics: options.analyzeTopics !== false,
        analyzeSentiment: options.analyzeSentiment !== false,
        extractKeywords: options.extractKeywords !== false,
        identifyEntities: options.identifyEntities !== false,
        model: options.model || 'gpt-4o-mini'
      };

      // Perform AI analysis
      const analysis = await aiUtils.analyzeContent(
        transcript.transcriptText,
        analysisOptions
      );

      // Process analysis results
      const contentAnalysis = {
        videoId,
        transcript: {
          wordCount: transcript.wordCount,
          language: transcript.language,
          duration: transcript.segments?.length || 0
        },
        
        // Topic analysis
        topics: analysis.topics || [],
        mainThemes: analysis.mainThemes || [],
        categories: analysis.categories || [],
        
        // Sentiment analysis
        overallSentiment: analysis.sentiment?.overall || 'neutral',
        sentimentScore: analysis.sentiment?.score || 0,
        sentimentDistribution: analysis.sentiment?.distribution || {},
        
        // Keywords and entities
        keywords: analysis.keywords || [],
        entities: analysis.entities || [],
        concepts: analysis.concepts || [],
        
        // Content metadata
        complexity: analysis.complexity || 'medium',
        readabilityScore: analysis.readability || 0,
        technicalLevel: analysis.technicalLevel || 'general',
        
        // AI processing info
        model: analysisOptions.model,
        analysisDate: new Date(),
        confidence: analysis.confidence || 0.8
      };

      logger.info('Content analysis completed:', {
        videoId,
        topicCount: contentAnalysis.topics.length,
        keywordCount: contentAnalysis.keywords.length,
        sentiment: contentAnalysis.overallSentiment
      });

      return contentAnalysis;

    } catch (error) {
      logger.error('Content analysis failed:', {
        videoId,
        error: error.message
      });
      throw new Error(`Content analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate video description using AI
   * @param {String} videoId - video ID
   * @param {Object} options - description generation options
   * @returns {Promise<String>} generated description
   */
  async generateVideoDescription(videoId, options = {}) {
    try {
      logger.info('Generating video description:', { videoId, options });

      // Get transcript
      let transcript = this.transcriptCache.get(videoId);
      if (!transcript) {
        transcript = await VideoTranscript.findOne({ video: videoId });
        if (!transcript) {
          throw new Error('No transcript found for video');
        }
      }

      // Prepare description options
      const descriptionOptions = {
        length: options.length || 'medium', // short, medium, long
        style: options.style || 'engaging', // professional, casual, engaging
        includeKeywords: options.includeKeywords !== false,
        includeTimestamps: options.includeTimestamps || false,
        model: options.model || 'gpt-4o-mini'
      };

      // Generate description
      const description = await aiUtils.generateDescription(
        transcript.transcriptText,
        descriptionOptions
      );

      logger.info('Video description generated:', {
        videoId,
        descriptionLength: description.length
      });

      return description;

    } catch (error) {
      logger.error('Description generation failed:', {
        videoId,
        error: error.message
      });
      throw new Error(`Description generation failed: ${error.message}`);
    }
  }

  /**
   * Get or generate transcript for video
   * @param {String} videoId - video ID
   * @param {Object} options - transcript options
   * @returns {Promise<Object>} transcript data
   */
  async getTranscript(videoId, options = {}) {
    try {
      // Check cache first
      let transcript = this.transcriptCache.get(videoId);
      
      if (!transcript) {
        // Check database
        transcript = await VideoTranscript.findOne({ video: videoId });
        
        if (transcript) {
          this.transcriptCache.set(videoId, transcript);
        }
      }

      if (!transcript && options.autoGenerate) {
        throw new Error('Transcript not found. Please provide audio file path for transcription.');
      }

      return transcript;

    } catch (error) {
      logger.error('Transcript retrieval failed:', {
        videoId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get summary for video at timestamp
   * @param {String} videoId - video ID
   * @param {Number} timestamp - timestamp for summary
   * @returns {Promise<Object>} summary data
   */
  async getSummary(videoId, timestamp) {
    try {
      const cacheKey = `${videoId}_${timestamp}`;
      
      // Check cache first
      let summary = this.summaryCache.get(cacheKey);
      
      if (!summary) {
        // Check database
        summary = await AISummary.findOne({
          video: videoId,
          startTimestamp: { $lte: timestamp },
          endTimestamp: { $gte: timestamp }
        });
        
        if (summary) {
          this.summaryCache.set(cacheKey, summary);
        }
      }

      return summary;

    } catch (error) {
      logger.error('Summary retrieval failed:', {
        videoId,
        timestamp,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extract audio from video for transcription
   * @param {String} videoPath - path to video file
   * @param {String} videoId - video ID for naming
   * @returns {Promise<String>} path to extracted audio file
   */
  async extractAudioForTranscription(videoPath, videoId) {
    try {
      const audioPath = path.join(this.tempPath, `${videoId}_audio.wav`);
      
      // Use ffmpeg to extract audio (this would need to be implemented)
      // For now, return the original path assuming it's audio-compatible
      logger.info('Audio extraction for transcription:', {
        videoPath,
        audioPath,
        videoId
      });

      // TODO: Implement actual audio extraction using ffmpeg
      // await extractAudio(videoPath, audioPath);

      return audioPath;

    } catch (error) {
      logger.error('Audio extraction failed:', {
        videoPath,
        videoId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process transcription result from AI service
   * @param {Object} transcriptionResult - raw transcription from AI
   * @param {String} videoId - video ID
   * @param {Object} options - processing options
   * @returns {Promise<Object>} processed transcript data
   */
  async processTranscriptionResult(transcriptionResult, videoId, options) {
    try {
      const startTime = Date.now();

      // Extract segments with timestamps
      const segments = transcriptionResult.segments || [];
      const words = transcriptionResult.words || [];
      
      // Calculate statistics
      const wordCount = words.length || transcriptionResult.text.split(/\s+/).length;
      const averageConfidence = words.length > 0 
        ? words.reduce((sum, word) => sum + (word.confidence || 0.9), 0) / words.length
        : 0.9;

      const processingTime = Date.now() - startTime;

      return {
        text: transcriptionResult.text,
        segments: segments.map(segment => ({
          id: segment.id,
          seek: segment.seek,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          tokens: segment.tokens,
          temperature: segment.temperature,
          avg_logprob: segment.avg_logprob,
          compression_ratio: segment.compression_ratio,
          no_speech_prob: segment.no_speech_prob
        })),
        words: words.map(word => ({
          word: word.word,
          start: word.start,
          end: word.end,
          confidence: word.confidence
        })),
        wordCount,
        averageConfidence,
        processingTime
      };

    } catch (error) {
      logger.error('Transcription result processing failed:', {
        videoId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Process summary result from AI service
   * @param {Object} summaryResult - raw summary from AI
   * @param {String} originalText - original text that was summarized
   * @param {Object} options - processing options
   * @returns {Promise<Object>} processed summary data
   */
  async processSummaryResult(summaryResult, originalText, options) {
    try {
      const summaryText = summaryResult.text || summaryResult.summary || '';
      
      // Extract key points if available
      const keyPoints = summaryResult.keyPoints || [];
      
      // Extract topics if available
      const topics = summaryResult.topics || [];
      
      // Calculate compression ratio
      const compressionRatio = originalText.length > 0 
        ? summaryText.length / originalText.length 
        : 0;

      // Analyze sentiment if requested
      let sentiment = null;
      if (options.analyzeSentiment) {
        sentiment = summaryResult.sentiment || 'neutral';
      }

      return {
        text: summaryText,
        keyPoints,
        topics,
        sentiment,
        compressionRatio
      };

    } catch (error) {
      logger.error('Summary result processing failed:', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Extract text from transcript up to specific timestamp
   * @param {Object} transcript - transcript object
   * @param {Number} timestamp - timestamp to extract up to
   * @param {Object} options - extraction options
   * @returns {String} extracted text
   */
  extractTextUpToTimestamp(transcript, timestamp, options = {}) {
    try {
      if (transcript.segments && transcript.segments.length > 0) {
        // Use segments for more accurate timestamp filtering
        const relevantSegments = transcript.segments.filter(
          segment => segment.start <= timestamp
        );
        
        return relevantSegments
          .map(segment => segment.text)
          .join(' ')
          .trim();
      } else {
        // Fallback to full text if no segments available
        // This is less accurate but better than nothing
        return transcript.transcriptText;
      }

    } catch (error) {
      logger.error('Text extraction failed:', {
        timestamp,
        error: error.message
      });
      return '';
    }
  }

  /**
   * Clean up cache to prevent memory leaks
   */
  cleanupCache() {
    try {
      const maxCacheAge = 2 * 60 * 60 * 1000; // 2 hours
      const cutoffTime = new Date(Date.now() - maxCacheAge);

      // Clean transcript cache
      for (const [key, transcript] of this.transcriptCache) {
        if (transcript.createdAt < cutoffTime) {
          this.transcriptCache.delete(key);
        }
      }

      // Clean summary cache
      for (const [key, summary] of this.summaryCache) {
        if (summary.createdAt < cutoffTime) {
          this.summaryCache.delete(key);
        }
      }

      // Clean processing queue of stale entries
      for (const [key, job] of this.processingQueue) {
        if (job.startTime < cutoffTime) {
          this.processingQueue.delete(key);
        }
      }

      logger.info('AI service cache cleaned up');

    } catch (error) {
      logger.error('Cache cleanup failed:', error);
    }
  }

  /**
   * Get AI service statistics
   * @returns {Object} service statistics
   */
  getServiceStats() {
    return {
      cacheStats: {
        transcripts: this.transcriptCache.size,
        summaries: this.summaryCache.size
      },
      processingQueue: {
        active: this.processingQueue.size,
        jobs: Array.from(this.processingQueue.keys())
      },
      memory: {
        transcriptCache: this.transcriptCache.size,
        summaryCache: this.summaryCache.size
      }
    };
  }
}

// Create singleton instance
const aiService = new AIService();

export default aiService;
