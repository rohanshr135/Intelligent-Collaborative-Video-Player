import mongoose from 'mongoose';
import { config } from './env.js';

const connectDB = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('MongoDB URI:', config.mongoUri ? 'URI is set' : 'URI is missing');
    
    await mongoose.connect(config.mongoUri, { 
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (err) {
    console.error('❌ MongoDB connection error:');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Full error:', err);
    
    console.log('⚠️  MongoDB connection failed. Server will run with in-memory storage.');
    console.log('⚠️  Some features may be limited without persistent storage.');
    
    return false;
  }
};

export default connectDB;
