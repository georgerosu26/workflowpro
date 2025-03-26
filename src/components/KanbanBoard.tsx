import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
  startDate?: string | Date
  dueDate?: string | Date
}

interface KanbanBoardProps {
  tasks: Task[]
  onUpdate: () => void
}

// Access the global task positions from the calendar component if available
declare global {
  interface Window {
    __taskCalendarPositions?: Record<string, { start: string, end: string }>
  }
}

export function KanbanBoard({ tasks, onUpdate }: KanbanBoardProps) {
  const columns = {
    todo: tasks.filter(task => task.status === 'todo'),
    'in-progress': tasks.filter(task => task.status === 'in-progress'),
    done: tasks.filter(task => task.status === 'done'),
  }

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return

    const { source, destination, draggableId } = result

    if (source.droppableId !== destination.droppableId) {
      // Prepare update data - always include status change
      const updateData: any = { 
        status: destination.droppableId,
      }

      // If moving to "done" column, attempt to get task time data from calendar
      if (destination.droppableId === 'done') {
        // Check three possible sources for time data in order of preference:
        
        // 1. First check global window variable (set by TaskCalendar.tsx)
        if (typeof window !== 'undefined' && window.__taskCalendarPositions?.[draggableId]) {
          const calendarData = window.__taskCalendarPositions[draggableId]
          updateData.startDate = calendarData.start
          updateData.dueDate = calendarData.end
          console.log('Using calendar position data from global variable for task:', draggableId)
        } 
        // 2. Then check localStorage (calendar component saves positions here too)
        else if (typeof window !== 'undefined') {
          try {
            const storedPositions = localStorage.getItem('calendar_task_positions')
            if (storedPositions) {
              const positions = JSON.parse(storedPositions)
              if (positions[draggableId]) {
                updateData.startDate = positions[draggableId].start
                updateData.dueDate = positions[draggableId].end
                console.log('Using calendar position data from localStorage for task:', draggableId)
              }
            }
          } catch (error) {
            console.warn('Error reading calendar positions from localStorage:', error)
          }
        }
        
        // 3. If neither source has data, use the current time as completed time
        if (!updateData.startDate || !updateData.dueDate) {
          const now = new Date()
          const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
          updateData.startDate = oneHourAgo.toISOString()
          updateData.dueDate = now.toISOString()
          console.log('Using current time as completion time for task:', draggableId)
        }
      }

      // Update task in the database with all collected data
      fetch(`/api/tasks/${draggableId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      })
        .then(response => {
          if (!response.ok) throw new Error('Failed to update task')
          onUpdate()
          toast.success('Task moved to ' + destination.droppableId.replace('-', ' '))
        })
        .catch(error => {
          console.error('Error updating task:', error)
          toast.error('Failed to update task')
        })
    }
  }

  return (
    <div className="h-full overflow-x-auto">
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 min-w-[768px]">
          {Object.entries(columns).map(([columnId, columnTasks]) => (
            <div key={columnId} className="bg-gray-50 p-4 rounded-lg">
              <h2 className="text-lg font-semibold mb-4 capitalize flex items-center justify-between sticky top-0 bg-gray-50">
                <span>{columnId.replace('-', ' ')}</span>
                <Badge variant="secondary">{columnTasks.length}</Badge>
              </h2>
              <Droppable droppableId={columnId}>
                {(provided) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="space-y-3"
                  >
                    {columnTasks.map((task, index) => (
                      <Draggable key={task.id} draggableId={task.id} index={index}>
                        {(provided) => (
                          <Card
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className="p-4 bg-white shadow-sm hover:shadow-md transition-shadow cursor-move"
                          >
                            <h3 className="font-semibold mb-2">{task.title}</h3>
                            <p className="text-gray-600 mb-3 text-sm">{task.description}</p>
                            <div className="flex items-center justify-between text-sm">
                              <Badge variant={
                                task.priority === 'high' ? 'destructive' :
                                task.priority === 'medium' ? 'secondary' :
                                'outline'
                              }>
                                {task.priority}
                              </Badge>
                              <Badge variant="outline">{task.category}</Badge>
                            </div>
                          </Card>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  )
} 