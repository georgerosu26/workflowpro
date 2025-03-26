import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import { ChatSession } from '@/models/ChatSession';
import { currentUser } from '@clerk/nextjs/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  try {
    const user = await currentUser();
    
    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Connecting to database...');
    try {
      await connectToDatabase();
      console.log('Connected to database successfully');
    } catch (error: unknown) {
      const dbConnError = error as Error;
      console.error('Database connection error:', dbConnError);
      return new NextResponse(
        JSON.stringify({ 
          error: 'Database connection failed',
          details: dbConnError.message || 'Unknown database error'
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    try {
      console.log('Fetching chat sessions for user:', user.id);
      const sessions = await ChatSession.find({ userId: user.id })
        .sort({ updatedAt: -1 })
        .exec();
      console.log('Found sessions:', sessions.length);

      return new NextResponse(
        JSON.stringify({ sessions }), 
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    } catch (dbError: any) {
      console.error('Database error details:', {
        name: dbError.name,
        message: dbError.message,
        code: dbError.code,
        keyPattern: dbError.keyPattern,
        keyValue: dbError.keyValue
      });
      
      return new NextResponse(
        JSON.stringify({ 
          error: 'Failed to fetch chat sessions',
          details: dbError.message
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error: any) {
    console.error('Error in GET /api/chat-sessions:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return new NextResponse(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser();
    
    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    let data;
    try {
      data = await req.json();
      console.log('Received chat session data:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.error('Error parsing request body:', parseError);
      return new NextResponse(
        JSON.stringify({ error: 'Invalid JSON in request body' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { id, title, messages } = data;

    if (!id) {
      return new NextResponse(
        JSON.stringify({ error: 'Session ID is required' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (!messages || !Array.isArray(messages)) {
      return new NextResponse(
        JSON.stringify({ error: 'Messages array is required' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Connecting to database...');
    try {
      await connectToDatabase();
      console.log('Connected to database successfully');
    } catch (error: unknown) {
      const dbConnError = error as Error;
      console.error('Database connection error:', dbConnError);
      return new NextResponse(
        JSON.stringify({ 
          error: 'Database connection failed',
          details: dbConnError.message || 'Unknown database error'
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    try {
      // Try to find existing session first
      console.log('Looking for existing session with id:', id);
      let session = await ChatSession.findOne({ id, userId: user.id });
      console.log('Existing session found:', !!session);

      if (session) {
        // Update existing session
        console.log('Updating existing session...');
        session.title = title || session.title;
        session.messages = messages;
        session.updatedAt = new Date();
      } else {
        // Create new session
        console.log('Creating new session...');
        session = new ChatSession({
          id,
          userId: user.id,
          title: title || 'New Chat',
          messages,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      console.log('Saving session to database...');
      try {
        await session.save();
        console.log('Session saved successfully');
        return new NextResponse(
          JSON.stringify({ session }), 
          { 
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      } catch (saveError) {
        console.error('Error saving session:', saveError);
        console.error('Validation errors:', session.validateSync());
        throw saveError;
      }
    } catch (dbError: any) {
      console.error('Database error details:', {
        name: dbError.name,
        message: dbError.message,
        code: dbError.code,
        keyPattern: dbError.keyPattern,
        keyValue: dbError.keyValue
      });
      
      return new NextResponse(
        JSON.stringify({ 
          error: 'Failed to save chat session to database',
          details: dbError.message
        }), 
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  } catch (error: any) {
    console.error('Error in POST /api/chat-sessions:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return new NextResponse(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
} 