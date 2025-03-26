import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongoose';
import { ChatSession } from '@/models/ChatSession';
import { currentUser } from '@clerk/nextjs/server';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const { id: sessionId } = params;
    if (!sessionId) {
      return new NextResponse(
        JSON.stringify({ error: 'Session ID is required' }), 
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    await connectToDatabase();
    
    const session = await ChatSession.findOne({
      id: sessionId,
      userId: user.id
    }).exec();

    if (!session) {
      return new NextResponse(
        JSON.stringify({ error: 'Chat session not found' }), 
        { 
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new NextResponse(
      JSON.stringify({ session }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error: any) {
    console.error('Error in GET /api/chat-sessions/[id]:', error);
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