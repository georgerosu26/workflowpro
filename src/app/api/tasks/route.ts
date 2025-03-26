import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import Task from '@/models/Task'
import { currentUser } from '@clerk/nextjs/server'

export async function GET(req: NextRequest) {
  try {
    const user = await currentUser()
    
    if (!user) {
      return new NextResponse(
        JSON.stringify({ error: 'Unauthorized' }), 
        { 
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const status = searchParams.get('status')

    console.log('Fetching tasks with params:', {
      userId: user.id,
      sessionId,
      status
    })

    await connectToDatabase()

    const query: any = { userId: user.id }
    if (sessionId) {
      query.sessionId = sessionId
      console.log('Filtering by sessionId:', sessionId)
    }
    if (status) query.status = status

    const tasks = await Task.find(query)
      .sort({ createdAt: -1 })
      .exec()

    console.log(`Found ${tasks.length} tasks matching query:`, query)

    return new NextResponse(
      JSON.stringify({ tasks }), 
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in GET /api/tasks:', error)
    return new NextResponse(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await currentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await req.json()
    const { tasks } = data

    if (!tasks || !Array.isArray(tasks)) {
      return NextResponse.json(
        { error: 'Tasks array is required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    // Validate tasks before creation
    const tasksWithUser = tasks.map(task => ({
      ...task,
      userId: user.id,
      id: task.id || crypto.randomUUID(),
      status: task.status || 'todo'
    }))

    console.log('Creating tasks:', JSON.stringify(tasksWithUser, null, 2))

    try {
      const createdTasks = await Task.create(tasksWithUser)
      console.log('Successfully created tasks:', createdTasks.length)
      return NextResponse.json({ tasks: createdTasks })
    } catch (dbError) {
      console.error('Database error creating tasks:', dbError)
      return NextResponse.json(
        { 
          error: 'Failed to create tasks',
          details: dbError instanceof Error ? dbError.message : 'Unknown database error'
        },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Error in POST /api/tasks:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await currentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const data = await req.json()
    const { id, ...updateData } = data

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const task = await Task.findOneAndUpdate(
      { id, userId: user.id },
      { ...updateData, updatedAt: new Date() },
      { new: true }
    )

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ task })
  } catch (error) {
    console.error('Error in PUT /api/tasks:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await currentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const task = await Task.findOneAndDelete({ id, userId: user.id })

    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/tasks:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 