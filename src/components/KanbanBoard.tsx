import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
}

interface KanbanBoardProps {
  tasks: Task[]
  onUpdate: () => void
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
      // Update task status in the database
      fetch(`/api/tasks/${draggableId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          status: destination.droppableId,
        }),
      })
        .then(response => {
          if (!response.ok) throw new Error('Failed to update task')
          onUpdate()
        })
        .catch(error => {
          console.error('Error updating task:', error)
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