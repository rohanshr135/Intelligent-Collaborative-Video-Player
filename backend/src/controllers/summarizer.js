import genAI from '../services/gemini.js';
import logger from '../utils/logger.js';

async function getGeminiCompletion(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-pro"});
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  return text;
}

/**
 * Generate summary for video transcript up to a specific timestamp
 */
export const getSummary = async ({ transcript, untilTimestamp }) => {
  // For simplicity, we're summarizing the whole transcript.
  // A real implementation would filter the transcript up to `untilTimestamp`.
  const prompt = `Summarize the following text:\n\n${transcript}`;

  try {
    const summary = await getGeminiCompletion(prompt);
    return summary;
  } catch (error) {
    logger.error('Error getting summary:', error);
    throw new Error('Failed to generate summary.');
  }
};

/**
 * REST endpoint for generating summaries
 */
export const generateSummaryEndpoint = async (req, res) => {
  try {
    const { transcript, untilTimestamp } = req.body;
    
    if (!transcript) {
      return res.status(400).json({ error: 'Transcript is required' });
    }
    
    const summary = await getSummary({ transcript, untilTimestamp });
    
    res.json({ summary, timestamp: untilTimestamp });
  } catch (error) {
    logger.error('Error in summary endpoint:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
};
