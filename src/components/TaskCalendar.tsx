import { useState, useMemo, useCallback, useEffect } from 'react'
import { Calendar, dateFnsLocalizer, View } from 'react-big-calendar'
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'
import { format, parse, startOfWeek, getDay, addHours, startOfDay, endOfDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { toast } from 'sonner'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'

interface Task {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
  category: string
  status: 'todo' | 'in-progress' | 'done'
  sessionId: string
  dueDate?: Date | string
  startDate?: Date | string
  updatedAt?: Date | string 
}

interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  priority: 'low' | 'medium' | 'high'
  resource?: any
  allDay?: boolean
}

interface TaskCalendarProps {
  tasks: Task[]
}

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

// Create the DnD Calendar
const DnDCalendar = withDragAndDrop(Calendar)

export function TaskCalendar({ tasks }: TaskCalendarProps) {
  // Get initial view from localStorage or default to 'week'
  const initialView = typeof window !== 'undefined' 
    ? localStorage.getItem('calendarView') as View || 'week'
    : 'week'

  const [view, setView] = useState<View>(initialView)
  const [date, setDate] = useState(new Date())
  const [myEvents, setMyEvents] = useState<CalendarEvent[]>([])

  // Function to load preferences from storage and URL
  const loadPreferences = useCallback(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const viewParam = params.get('calendarView')
    const dateParam = params.get('calendarDate')

    // Load view preference
    if (viewParam && ['month', 'week', 'day'].includes(viewParam)) {
      setView(viewParam as View)
      localStorage.setItem('userCalendarView', viewParam)
    } else {
      const savedView = localStorage.getItem('userCalendarView')
      if (savedView && ['month', 'week', 'day'].includes(savedView)) {
        setView(savedView as View)
        // Update URL with saved view
        params.set('calendarView', savedView)
        updateURL(params)
      }
    }

    // Load date preference
    if (dateParam) {
      const parsedDate = new Date(dateParam)
      if (!isNaN(parsedDate.getTime())) {
        setDate(parsedDate)
        localStorage.setItem('userCalendarDate', parsedDate.toISOString())
      }
    } else {
      const savedDate = localStorage.getItem('userCalendarDate')
      if (savedDate) {
        const parsedDate = new Date(savedDate)
        if (!isNaN(parsedDate.getTime())) {
          const thirtyDaysAgo = new Date()
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
          if (parsedDate >= thirtyDaysAgo) {
            setDate(parsedDate)
            // Update URL with saved date
            params.set('calendarDate', parsedDate.toISOString())
            updateURL(params)
          } else {
            localStorage.removeItem('userCalendarDate')
          }
        }
      }
    }
  }, [])

  // Function to update URL while preserving other parameters
  const updateURL = useCallback((params: URLSearchParams) => {
    if (typeof window === 'undefined') return
    const newURL = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
    window.history.replaceState({ path: newURL }, '', newURL)
  }, [])

  // Load preferences on mount and URL changes
  useEffect(() => {
    loadPreferences()

    // Listen for URL changes (e.g., browser back/forward)
    const handleRouteChange = () => {
      loadPreferences()
    }

    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [loadPreferences])

  // Handle view changes
  const handleViewChange = useCallback((newView: View) => {
    setView(newView)
    if (typeof window !== 'undefined') {
      localStorage.setItem('calendarView', newView)
      localStorage.setItem('userCalendarView', newView)
      
      // Update URL params
      const params = new URLSearchParams(window.location.search)
      params.set('calendarView', newView)
      updateURL(params)
    }
  }, [updateURL])

  // Handle date changes
  const handleNavigate = useCallback((newDate: Date) => {
    setDate(newDate)
    
    if (typeof window !== 'undefined') {
      localStorage.setItem('userCalendarDate', newDate.toISOString())
      
      // Update URL params
      const params = new URLSearchParams(window.location.search)
      params.set('calendarDate', newDate.toISOString())
      updateURL(params)
    }
  }, [updateURL])

  // Initialize events from tasks
  useEffect(() => {
    if (!tasks?.length) return

    // Try to load cached events from localStorage
    if (typeof window !== 'undefined') {
      try {
        const storedTaskPositions = localStorage.getItem('calendar_task_positions')
        const timestamp = localStorage.getItem('calendar_task_positions_timestamp')
        
        if (storedTaskPositions && timestamp) {
          const taskPositionMap = JSON.parse(storedTaskPositions)
          const lastUpdate = new Date(timestamp)
          const oneDayAgo = new Date()
          oneDayAgo.setDate(oneDayAgo.getDate() - 1)
          
          // Use stored positions if they're less than a day old
          if (lastUpdate > oneDayAgo) {
            // Apply stored positions to current tasks
            const newEvents = tasks.map(task => {
              const storedPosition = taskPositionMap[task.id]
              
              // Use stored position if available, otherwise use task data
              let start, end
              if (storedPosition) {
                start = new Date(storedPosition.start)
                end = new Date(storedPosition.end)
              } else {
                start = task.startDate ? new Date(task.startDate) : startOfDay(new Date())
                end = task.dueDate ? new Date(task.dueDate) : addHours(start, 1)
              }
              
              // Ensure valid dates
              if (isNaN(start.getTime())) {
                start = startOfDay(new Date())
              }
              if (isNaN(end.getTime())) {
                end = addHours(start, 1)
              }
              
              // Ensure end is after start
              if (end <= start) {
                end = addHours(start, 1)
              }
              
              return {
                id: task.id,
                title: task.title,
                start,
                end,
                allDay: false,
                priority: task.priority,
              }
            })
            
            // Sort events
            newEvents.sort((a, b) => a.start.getTime() - b.start.getTime())
            setMyEvents(newEvents)
            return // Early return if we used stored positions
          }
        }
      } catch (error) {
        console.warn('Failed to load events from localStorage:', error)
      }
    }
    
    // If no stored events or they weren't usable, create new events from tasks
    const newEvents = tasks.map(task => {
      let start = task.startDate ? new Date(task.startDate) : startOfDay(new Date())
      let end = task.dueDate ? new Date(task.dueDate) : addHours(start, 1)

      // Ensure valid dates
      if (isNaN(start.getTime())) {
        console.warn('Invalid start date for task:', task)
        start = startOfDay(new Date())
      }
      if (isNaN(end.getTime())) {
        end = addHours(start, 1)
      }

      // Ensure end is after start
      if (end <= start) {
        end = addHours(start, 1)
      }

      return {
        id: task.id,
        title: task.title,
        start,
        end,
        allDay: false,
        priority: task.priority,
      }
    })

    // Sort events to ensure consistent rendering
    newEvents.sort((a, b) => a.start.getTime() - b.start.getTime())
    
    setMyEvents(newEvents)
  }, [tasks])

  // Save event positions to localStorage whenever myEvents changes
  useEffect(() => {
    if (!myEvents.length || typeof window === 'undefined') return
    
    try {
      // Create a map of task IDs to their positions
      const taskPositionMap: Record<string, { start: string, end: string }> = myEvents.reduce((acc, event) => {
        acc[event.id] = {
          start: event.start.toISOString(),
          end: event.end.toISOString()
        }
        return acc
      }, {} as Record<string, { start: string, end: string }>)
      
      // Save to localStorage
      localStorage.setItem('calendar_task_positions', JSON.stringify(taskPositionMap))
      localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString())
    } catch (error) {
      console.warn('Failed to save task positions to localStorage:', error)
    }
  }, [myEvents])

  // Save positions on component unmount to ensure no data is lost
  useEffect(() => {
    return () => {
      if (!myEvents.length || typeof window === 'undefined') return;
      
      try {
        // Create a map of task IDs to their positions
        const taskPositionMap: Record<string, { start: string, end: string }> = myEvents.reduce((acc, event) => {
          acc[event.id] = {
            start: event.start.toISOString(),
            end: event.end.toISOString()
          }
          return acc
        }, {} as Record<string, { start: string, end: string }>)
        
        // Save to localStorage before unmount
        localStorage.setItem('calendar_task_positions', JSON.stringify(taskPositionMap))
        localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString())
        console.log('Saved calendar positions before unmount')
      } catch (error) {
        console.warn('Failed to save task positions on unmount:', error)
      }
    };
  }, [myEvents]);

  // Force database update when moving out of calendar tab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && myEvents.length > 0) {
        // Page is being hidden, save state to localStorage
        try {
          // Create a map of task IDs to their positions
          const taskPositionMap: Record<string, { start: string, end: string }> = myEvents.reduce((acc, event) => {
            acc[event.id] = {
              start: event.start.toISOString(),
              end: event.end.toISOString()
            }
            return acc
          }, {} as Record<string, { start: string, end: string }>)
          
          // Save to localStorage
          localStorage.setItem('calendar_task_positions', JSON.stringify(taskPositionMap))
          localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString())
        } catch (error) {
          console.warn('Failed to save positions on visibility change:', error)
        }
      }
    };
    
    // Listen for tab/window visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [myEvents]);

  // Function to update task in the database
  const updateTaskInDatabase = useCallback(async (
    taskId: string, 
    startDate: Date, 
    endDate: Date, 
    isAllDay: boolean
  ) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate: startDate.toISOString(),
          dueDate: endDate.toISOString(),
          isAllDay,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to update task')
      }

      // Dispatch refresh event with action type 'update'
      window.dispatchEvent(new CustomEvent('refreshTasks', {
        detail: { action: 'update', taskId }
      }))

      toast.success('Task updated successfully')
      return true
    } catch (error) {
      console.error('Error updating task:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to update task')
      return false
    }
  }, [])

  const moveEvent = useCallback(
    async ({ event, start, end, isAllDay: droppedOnAllDaySlot = false }: any) => {
      const startDate = new Date(start)
      const endDate = new Date(end)
      
      // Optimistically update UI
      const updatedEvent = { 
        ...event, 
        start: startDate,
        end: endDate,
        allDay: droppedOnAllDaySlot
      }

      // Update events in state immediately
      setMyEvents(prev => {
        const filtered = prev.filter(ev => ev.id !== event.id)
        const updatedEvents = [...filtered, updatedEvent]
        
        // Store task positions in localStorage (session independent)
        if (typeof window !== 'undefined') {
          try {
            // Create a map of task IDs to their positions
            const taskPositionMap: Record<string, { start: string, end: string }> = updatedEvents.reduce((acc, ev) => {
              acc[ev.id] = {
                start: ev.start.toISOString(),
                end: ev.end.toISOString()
              }
              return acc
            }, {} as Record<string, { start: string, end: string }>)
            
            localStorage.setItem('calendar_task_positions', JSON.stringify(taskPositionMap))
            localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString())
          } catch (err) {
            console.warn('Failed to save task positions to localStorage:', err)
          }
        }
        
        return updatedEvents
      })

      // Try updating the database with retries
      let retries = 0;
      const maxRetries = 3;
      let success = false;
      
      while (retries < maxRetries && !success) {
        try {
          // Update database
          const response = await fetch(`/api/tasks/${event.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              startDate: startDate.toISOString(),
              dueDate: endDate.toISOString(),
              isAllDay: droppedOnAllDaySlot,
            }),
          })

          if (response.ok) {
            success = true;
            // Don't dispatch refresh event to prevent reverting changes
            if (retries === 0) { // Only show toast on first successful attempt
              toast.success('Task updated successfully')
            }
          } else {
            const errorData = await response.json()
            throw new Error(errorData.message || 'Failed to update task')
          }
        } catch (error) {
          console.error(`Error updating task (attempt ${retries + 1}):`, error)
          retries++;
          
          if (retries >= maxRetries) {
            toast.error('Failed to update task in database, but your changes are saved locally')
          } else {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retries))
          }
        }
      }
      
      // Even if database update failed, we keep the UI updated and localStorage saved
      // This ensures the user's changes persist locally
    },
    []
  )

  const resizeEvent = useCallback(
    async ({ event, start, end }: any) => {
      const startDate = new Date(start)
      const endDate = new Date(end)
      
      // Optimistically update UI
      const updatedEvent = { 
        ...event, 
        start: startDate,
        end: endDate,
        allDay: false
      }

      // Update events in state
      setMyEvents(prev => {
        const filtered = prev.filter(ev => ev.id !== event.id)
        const updatedEvents = [...filtered, updatedEvent]
        
        // Store updated events in localStorage to persist between sessions
        if (typeof window !== 'undefined') {
          try {
            const taskPositionMap: Record<string, { start: string, end: string }> = updatedEvents.reduce((acc, ev) => {
              acc[ev.id] = {
                start: ev.start.toISOString(),
                end: ev.end.toISOString()
              }
              return acc
            }, {} as Record<string, { start: string, end: string }>)
            
            localStorage.setItem('calendar_task_positions', JSON.stringify(taskPositionMap))
            localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString())
          } catch (err) {
            console.warn('Failed to save task positions to localStorage:', err)
          }
        }
        
        return updatedEvents
      })

      try {
        // Update directly to the database
        const response = await fetch(`/api/tasks/${event.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: startDate.toISOString(),
            dueDate: endDate.toISOString(),
            isAllDay: false,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Failed to update task')
        }

        // Don't dispatch refresh event to prevent reverting changes
        toast.success('Task updated successfully')
      } catch (error) {
        console.error('Error updating task:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to update task')
        
        // Revert if failed
        setMyEvents(prev => {
          const filtered = prev.filter(ev => ev.id !== event.id)
          const updatedEvents = [...filtered, event]
          
          // Update localStorage with reverted state
          if (typeof window !== 'undefined') {
            try {
              const taskPositionMap: Record<string, { start: string, end: string }> = updatedEvents.reduce((acc, ev) => {
                acc[ev.id] = {
                  start: ev.start.toISOString(),
                  end: ev.end.toISOString()
                }
                return acc
              }, {} as Record<string, { start: string, end: string }>)
              
              localStorage.setItem('calendar_task_positions', JSON.stringify(taskPositionMap))
              localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString())
            } catch (err) {
              console.warn('Failed to save task positions to localStorage:', err)
            }
          }
          
          return updatedEvents
        })
      }
    },
    []
  )

  const getPriorityColor = (priority: 'low' | 'medium' | 'high') => {
    switch (priority) {
      case 'high':
        return 'rgb(239 68 68)'
      case 'medium':
        return 'rgb(234 179 8)'
      case 'low':
        return 'rgb(34 197 94)'
    }
  }

  const formats = {
    timeGutterFormat: 'ha',
    eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${format(start, 'h:mma')} - ${format(end, 'h:mma')}`,
  }

  return (
    <div className="h-full bg-white p-4 rounded-lg shadow">
      <DnDCalendar
        localizer={localizer}
        events={myEvents}
        startAccessor={(event: object) => (event as CalendarEvent).start}
        endAccessor={(event: object) => (event as CalendarEvent).end}
        style={{ height: 'calc(100% - 16px)' }}
        defaultView={view}
        view={view}
        onView={handleViewChange}
        date={date}
        onNavigate={handleNavigate}
        views={['month', 'week', 'day']}
        step={30}
        timeslots={2}
        min={new Date(new Date().setHours(6, 0, 0))}
        max={new Date(new Date().setHours(20, 0, 0))}
        onEventDrop={moveEvent}
        onEventResize={resizeEvent}
        selectable
        resizable
        showMultiDayTimes
        className="custom-calendar"
        formats={formats}
        slotPropGetter={() => ({
          style: {
            minHeight: '60px',
          },
        })}
        eventPropGetter={(event: any) => ({
          className: `event-${(event as CalendarEvent).priority}`,
          style: {
            backgroundColor: getPriorityColor((event as CalendarEvent).priority),
            color: 'white',
            borderRadius: '4px',
            border: 'none',
            padding: '2px 5px',
          },
        })}
      />
      <style jsx global>{`
        .custom-calendar .rbc-time-content {
          font-size: 0.95rem;
        }
        .custom-calendar .rbc-timeslot-group {
          min-height: 60px !important;
        }
        .custom-calendar .rbc-time-slot {
          min-height: 30px !important;
        }
        .custom-calendar .rbc-time-header-content {
          font-weight: 500;
        }
        .custom-calendar .rbc-today {
          background-color: rgba(66, 153, 225, 0.08);
        }
        .custom-calendar .rbc-current-time-indicator {
          height: 2px;
          background-color: #e53e3e;
        }
      `}</style>
    </div>
  )
}