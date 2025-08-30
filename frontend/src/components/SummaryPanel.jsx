import React, { useState, useEffect } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';
import { api } from '../services/api.js';

export default function SummaryPanel() {
  const [summary, setSummary] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const { code, user } = useRoomStore();

  // Load existing summary
  useEffect(() => {
    if (!code) return;
    
    const loadSummary = async () => {
      try {
        const response = await api.get(`/summary/${code}/summary`);
        if (response.data.summary) {
          setSummary(response.data.summary);
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          console.error('Failed to load summary:', error);
        }
      }
    };

    loadSummary();
  }, [code]);

  const generateSummary = async () => {
    if (!code || !user || isGenerating) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await api.post('/summary/generate', {
        roomCode: code,
        userId: user.id,
        username: user.name,
        videoUrl: getCurrentVideoUrl(),
        videoDuration: getCurrentVideoDuration()
      });

      setSummary(response.data.summary);
    } catch (error) {
      console.error('Failed to generate summary:', error);
      setError('Failed to generate summary. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const exportSummary = async (format = 'json') => {
    if (!summary) return;

    try {
      const response = await api.get(`/summary/${code}/export?format=${format}`);
      
      let filename, contentType;
      if (format === 'json') {
        filename = `summary-${code}.json`;
        contentType = 'application/json';
      } else if (format === 'text') {
        filename = `summary-${code}.txt`;
        contentType = 'text/plain';
      }

      const blob = new Blob([typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)], 
        { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export summary:', error);
      alert('Failed to export summary. Please try again.');
    }
  };

  const getCurrentVideoUrl = () => {
    const video = document.querySelector('video');
    return video?.src || '';
  };

  const getCurrentVideoDuration = () => {
    const video = document.querySelector('video');
    return video?.duration || 0;
  };

  const jumpToSegment = (timestamp) => {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = timestamp;
    }
  };

  const formatTimestamp = (timestamp) => {
    const minutes = Math.floor(timestamp / 60);
    const seconds = Math.floor(timestamp % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">AI Summary</h3>
            <p className="text-sm text-gray-600">
              {summary ? 'Summary generated' : 'No summary available'}
            </p>
          </div>
          <div className="flex space-x-2">
            {summary && (
              <>
                <button
                  onClick={() => exportSummary('text')}
                  className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                >
                  Export TXT
                </button>
                <button
                  onClick={() => exportSummary('json')}
                  className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
                >
                  Export JSON
                </button>
              </>
            )}
            <button
              onClick={generateSummary}
              disabled={isGenerating}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {isGenerating ? 'Generating...' : summary ? 'Regenerate' : 'Generate Summary'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Generating AI summary...</p>
              <p className="text-xs text-gray-500 mt-2">This may take a few moments</p>
            </div>
          </div>
        )}

        {!summary && !isGenerating && !error && (
          <div className="text-center py-12">
            <div className="bg-blue-50 rounded-lg p-6">
              <div className="text-4xl mb-4">🤖</div>
              <h4 className="text-lg font-medium text-gray-800 mb-2">AI-Powered Video Summary</h4>
              <p className="text-gray-600 mb-4">
                Generate an intelligent summary of your video content with key insights, timestamps, and highlights.
              </p>
              <button
                onClick={generateSummary}
                className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
              >
                Generate Summary
              </button>
            </div>
          </div>
        )}

        {summary && !isGenerating && (
          <div className="space-y-6">
            {/* Full Summary */}
            <div className="bg-white rounded-lg border p-6">
              <h4 className="text-lg font-semibold text-gray-800 mb-3">Overview</h4>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {summary.fullSummary}
              </p>
            </div>

            {/* Key Insights */}
            {summary.keyInsights && summary.keyInsights.length > 0 && (
              <div className="bg-white rounded-lg border p-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-3">Key Insights</h4>
                <ul className="space-y-2">
                  {summary.keyInsights.map((insight, index) => (
                    <li key={index} className="flex items-start space-x-2">
                      <span className="text-blue-500 mt-1">•</span>
                      <span className="text-gray-700">{insight}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Timestamped Segments */}
            {summary.segments && summary.segments.length > 0 && (
              <div className="bg-white rounded-lg border p-6">
                <h4 className="text-lg font-semibold text-gray-800 mb-3">Timestamped Segments</h4>
                <div className="space-y-4">
                  {summary.segments.map((segment, index) => (
                    <div key={index} className="border-l-4 border-blue-200 pl-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <button
                          onClick={() => jumpToSegment(segment.startTime)}
                          className="bg-blue-100 text-blue-800 px-3 py-1 rounded text-sm hover:bg-blue-200 cursor-pointer"
                          title="Jump to this segment"
                        >
                          {formatTimestamp(segment.startTime)} - {formatTimestamp(segment.endTime)}
                        </button>
                        {segment.importance && (
                          <span className={`px-2 py-1 rounded text-xs ${
                            segment.importance === 'high' ? 'bg-red-100 text-red-800' :
                            segment.importance === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {segment.importance} importance
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed">
                        {segment.summary}
                      </p>
                      {segment.keyPoints && segment.keyPoints.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {segment.keyPoints.map((point, pointIndex) => (
                            <li key={pointIndex} className="text-xs text-gray-600 ml-4">
                              • {point}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="text-sm font-medium text-gray-700 mb-2">Summary Details</h5>
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                <div>
                  <span className="font-medium">Generated:</span>{' '}
                  {new Date(summary.generatedAt).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">By:</span> {summary.generatedBy || 'AI Assistant'}
                </div>
                <div>
                  <span className="font-medium">Segments:</span> {summary.segments?.length || 0}
                </div>
                <div>
                  <span className="font-medium">Key Insights:</span> {summary.keyInsights?.length || 0}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
