'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GripVertical, Clock, Tag } from 'lucide-react'
import { Task } from '@/types/task'

interface Props {
  task: Task
}

const priorityColors = {
  low: 'bg-gray-100 text-gray-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800'
}

export function KanbanTask({ task }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className="p-4 cursor-move hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2">
        <div {...attributes} {...listeners}>
          <GripVertical className="h-5 w-5 text-gray-500" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">{task.title}</h3>
            <Badge className={priorityColors[task.priority]}>
              {task.priority}
            </Badge>
          </div>
          <p className="text-sm text-gray-600 mb-3">{task.description}</p>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Tag className="h-4 w-4" />
              {task.category}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {task.status === 'done' ? 'Done' : task.status === 'in-progress' ? 'In Progress' : 'To Do'}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
} 