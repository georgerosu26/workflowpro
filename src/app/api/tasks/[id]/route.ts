import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongoose'
import TaskModel from '@/models/Task'
import { currentUser } from '@clerk/nextjs/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await currentUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await req.json()
    
    await connectToDatabase()

    // Validate dates if provided
    if (body.startDate || body.dueDate) {
      const startDate = body.startDate ? new Date(body.startDate) : null
      const dueDate = body.dueDate ? new Date(body.dueDate) : null

      if (startDate && isNaN(startDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid start date format' },
          { status: 400 }
        )
      }

      if (dueDate && isNaN(dueDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid due date format' },
          { status: 400 }
        )
      }

      if (startDate && dueDate && startDate > dueDate) {
        return NextResponse.json(
          { error: 'Start date cannot be after due date' },
          { status: 400 }
        )
      }
    }

    // Create update object with all possible fields
    const updateData: any = {}
    if (body.status) updateData.status = body.status
    if (body.startDate) updateData.startDate = new Date(body.startDate)
    if (body.dueDate) updateData.dueDate = new Date(body.dueDate)
    if (body.hasOwnProperty('isAllDay')) updateData.isAllDay = Boolean(body.isAllDay)
    updateData.updatedAt = new Date()

    console.log('Updating task:', { id, updateData })

    const task = await TaskModel.findOneAndUpdate(
      { id, userId: user.id },
      updateData,
      { new: true, runValidators: true }
    )

    if (!task) {
      console.log('Task not found:', id)
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      )
    }

    console.log('Task updated successfully:', task)
    return NextResponse.json({ 
      task,
      message: 'Task updated successfully',
      success: true
    })
  } catch (error) {
    console.error('Error updating task:', error)
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    )
  }
} 