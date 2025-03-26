'use client'

import React from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Card } from '@/components/ui/card'
import { KanbanTask } from './KanbanTask'
import { Task } from '@/types/task'

interface Props {
  id: string
  title: string
  color: string
  tasks: Task[]
}

export function KanbanColumn({ id, title, color, tasks }: Props) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <Card ref={setNodeRef} className={`p-4 ${color}`}>
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div className="space-y-3">
        {tasks.map(task => (
          <KanbanTask key={task.id} task={task} />
        ))}
      </div>
    </Card>
  )
} 