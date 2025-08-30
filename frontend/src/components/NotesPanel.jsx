import React, { useState, useRef, useEffect } from 'react';
import { useRoomStore } from '../state/useRoomStore.js';
import { api } from '../services/api.js';
import { getSocket } from '../services/socket.js';

export default function NotesPanel() {
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [selectedNote, setSelectedNote] = useState(null);
  const { code, user } = useRoomStore();

  // Load existing notes
  useEffect(() => {
    if (!code) return;
    
    const loadNotes = async () => {
      try {
        const response = await api.get(`/notes/${code}/notes`);
        setNotes(response.data.notes || []);
      } catch (error) {
        console.error('Failed to load notes:', error);
      }
    };

    loadNotes();
  }, [code]);

  // Socket event listeners for real-time notes
  useEffect(() => {
    const socket = getSocket();
    
    const handleNewNote = (note) => {
      setNotes(prev => [...prev, note]);
    };

    const handleNoteUpdate = (updatedNote) => {
      setNotes(prev => prev.map(note => 
        note._id === updatedNote._id ? updatedNote : note
      ));
    };

    const handleNoteDelete = (noteId) => {
      setNotes(prev => prev.filter(note => note._id !== noteId));
    };

    socket.on('notes:new', handleNewNote);
    socket.on('notes:update', handleNoteUpdate);
    socket.on('notes:delete', handleNoteDelete);

    return () => {
      socket.off('notes:new', handleNewNote);
      socket.off('notes:update', handleNoteUpdate);
      socket.off('notes:delete', handleNoteDelete);
    };
  }, []);

  const getCurrentVideoTime = () => {
    const video = document.querySelector('video');
    return video ? video.currentTime : 0;
  };

  const createNote = async () => {
    if (!newNote.trim() || !code || !user) return;

    try {
      const noteData = {
        roomCode: code,
        userId: user.id,
        username: user.name,
        content: newNote.trim(),
        timestamp: getCurrentVideoTime(),
        position: { x: 100, y: 100 }
      };

      await api.post('/notes/create', noteData);
      setNewNote('');
      setShowNoteForm(false);
    } catch (error) {
      console.error('Failed to create note:', error);
      alert('Failed to create note. Please try again.');
    }
  };

  const updateNote = async (noteId, content) => {
    try {
      await api.put(`/notes/notes/${noteId}`, {
        userId: user.id,
        content
      });
      setEditingNote(null);
    } catch (error) {
      console.error('Failed to update note:', error);
      alert('Failed to update note. Please try again.');
    }
  };

  const deleteNote = async (noteId) => {
    if (!confirm('Are you sure you want to delete this note?')) return;

    try {
      await api.delete(`/notes/notes/${noteId}`, {
        data: { userId: user.id }
      });
    } catch (error) {
      console.error('Failed to delete note:', error);
      alert('Failed to delete note. Please try again.');
    }
  };

  const jumpToTimestamp = (timestamp) => {
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

  const resolveNote = async (noteId, isResolved) => {
    try {
      await api.put(`/notes/notes/${noteId}`, {
        userId: user.id,
        isResolved: !isResolved
      });
    } catch (error) {
      console.error('Failed to resolve note:', error);
    }
  };

  const addComment = async (noteId, comment) => {
    if (!comment.trim()) return;

    try {
      await api.post(`/notes/notes/${noteId}/comments`, {
        userId: user.id,
        username: user.name,
        content: comment.trim()
      });
    } catch (error) {
      console.error('Failed to add comment:', error);
      alert('Failed to add comment. Please try again.');
    }
  };

  const exportNotes = async () => {
    try {
      const response = await api.get(`/notes/${code}/export?format=text`);
      const blob = new Blob([response.data], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `notes-${code}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export notes:', error);
      alert('Failed to export notes. Please try again.');
    }
  };

  const sortedNotes = notes.sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="flex flex-col h-full bg-gray-50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Notes</h3>
            <p className="text-sm text-gray-600">
              {notes.length} notes • {notes.filter(n => !n.isResolved).length} unresolved
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={exportNotes}
              className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
              disabled={notes.length === 0}
            >
              Export
            </button>
            <button
              onClick={() => setShowNoteForm(true)}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
            >
              Add Note
            </button>
          </div>
        </div>
      </div>

      {/* Add Note Form */}
      {showNoteForm && (
        <div className="bg-yellow-50 border-b p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-800">Add New Note</h4>
              <button
                onClick={() => setShowNoteForm(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                Timestamp: {formatTimestamp(getCurrentVideoTime())}
              </p>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Enter your note..."
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
              <div className="flex space-x-2">
                <button
                  onClick={createNote}
                  disabled={!newNote.trim()}
                  className="bg-blue-500 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-600 disabled:opacity-50"
                >
                  Add Note
                </button>
                <button
                  onClick={() => setShowNoteForm(false)}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedNotes.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No notes yet. Add your first note!</p>
            <p className="text-xs mt-2">
              Notes are automatically timestamped with the current video time
            </p>
          </div>
        ) : (
          sortedNotes.map((note) => (
            <div 
              key={note._id} 
              className={`bg-white rounded-lg border p-4 ${note.isResolved ? 'opacity-60' : ''}`}
            >
              {/* Note Header */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span
                    className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs cursor-pointer hover:bg-blue-200"
                    onClick={() => jumpToTimestamp(note.timestamp)}
                    title="Jump to timestamp"
                  >
                    @{formatTimestamp(note.timestamp)}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {note.username}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </span>
                </div>
                
                {/* Note Actions */}
                {note.userId === user?.id && (
                  <div className="flex space-x-1">
                    <button
                      onClick={() => resolveNote(note._id, note.isResolved)}
                      className={`text-xs px-2 py-1 rounded ${
                        note.isResolved 
                          ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' 
                          : 'bg-green-100 text-green-800 hover:bg-green-200'
                      }`}
                      title={note.isResolved ? 'Mark as unresolved' : 'Mark as resolved'}
                    >
                      {note.isResolved ? 'Resolved' : 'Resolve'}
                    </button>
                    <button
                      onClick={() => setEditingNote(note._id)}
                      className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteNote(note._id)}
                      className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Note Content */}
              {editingNote === note._id ? (
                <NoteEditor
                  initialContent={note.content}
                  onSave={(content) => updateNote(note._id, content)}
                  onCancel={() => setEditingNote(null)}
                />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {note.content}
                </p>
              )}

              {/* Comments */}
              {note.comments && note.comments.length > 0 && (
                <div className="mt-3 space-y-2">
                  <h5 className="text-xs font-medium text-gray-600">Comments:</h5>
                  {note.comments.map((comment, index) => (
                    <div key={index} className="bg-gray-50 rounded p-2">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xs font-medium text-gray-700">
                          {comment.username}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(comment.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Comment */}
              <CommentForm 
                onSubmit={(comment) => addComment(note._id, comment)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function NoteEditor({ initialContent, onSave, onCancel }) {
  const [content, setContent] = useState(initialContent);

  return (
    <div className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        rows={3}
      />
      <div className="flex space-x-2">
        <button
          onClick={() => onSave(content)}
          disabled={!content.trim()}
          className="bg-blue-500 text-white px-3 py-1 rounded text-xs font-medium hover:bg-blue-600 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="bg-gray-300 text-gray-700 px-3 py-1 rounded text-xs font-medium hover:bg-gray-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CommentForm({ onSubmit }) {
  const [comment, setComment] = useState('');
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (comment.trim()) {
      onSubmit(comment);
      setComment('');
      setShowForm(false);
    }
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="mt-2 text-xs text-blue-600 hover:text-blue-800"
      >
        Add comment
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-2 space-y-2">
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment..."
        className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
        autoFocus
      />
      <div className="flex space-x-2">
        <button
          type="submit"
          disabled={!comment.trim()}
          className="bg-blue-500 text-white px-2 py-1 rounded text-xs hover:bg-blue-600 disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setShowForm(false)}
          className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs hover:bg-gray-400"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
