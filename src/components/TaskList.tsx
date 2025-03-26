import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { TaskCalendar } from './TaskCalendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  status: 'todo' | 'in-progress' | 'done';
  sessionId: string;
  startDate?: Date;
  dueDate?: Date;
}

export default function TaskList() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');
  
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'calendar'>('board');

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        const url = new URL('/api/tasks', window.location.origin);
        if (sessionId) {
          url.searchParams.set('sessionId', sessionId);
        }
        
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('Failed to fetch tasks');
        }
        
        const data = await response.json();
        console.log('Fetched tasks:', data.tasks);
        setTasks(data.tasks || []);
      } catch (err) {
        console.error('Error fetching tasks:', err);
        setError(err instanceof Error ? err.message : 'Failed to load tasks');
        toast.error('Failed to load tasks');
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [sessionId]);

  const columns = {
    'todo': tasks.filter(task => task.status === 'todo'),
    'in-progress': tasks.filter(task => task.status === 'in-progress'),
    'done': tasks.filter(task => task.status === 'done')
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const task = tasks.find(t => t.id === draggableId);
    if (!task) return;

    const newStatus = destination.droppableId as Task['status'];
    
    try {
      // Optimistically update the UI
      setTasks(tasks.map(t => 
        t.id === task.id ? { ...t, status: newStatus } : t
      ));

      const response = await fetch(`/api/tasks/${task.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update task');
      }

      toast.success('Task status updated');
    } catch (err) {
      console.error('Error updating task:', err);
      // Revert the drag if the update failed
      setTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: source.droppableId as Task['status'] } : t
      ));
      toast.error('Failed to update task status');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <span className="ml-2">Loading tasks...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p className="mb-2">
          {sessionId 
            ? "No tasks found for this chat session" 
            : "No tasks found. Start a chat to create some tasks!"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="board" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="board">Kanban Board</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="board">
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(columns).map(([columnId, columnTasks]) => (
                <div key={columnId} className="bg-gray-50 p-4 rounded-lg">
                  <h2 className="text-lg font-semibold mb-4 capitalize flex items-center justify-between">
                    <span>{columnId.replace('-', ' ')}</span>
                    <Badge variant="secondary">{columnTasks.length}</Badge>
                  </h2>
                  <Droppable droppableId={columnId}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className="min-h-[200px] space-y-3"
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
        </TabsContent>

        <TabsContent value="calendar">
          <TaskCalendar tasks={tasks} />
        </TabsContent>
      </Tabs>
    </div>
  );
} 