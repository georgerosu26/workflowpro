import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
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

// Create a dedicated module-level variable to store positions across renders
// This will persist even when components unmount/remount, as long as the page isn't refreshed
let globalTaskPositions: Record<string, { start: string, end: string }> = {};

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

  // Add a state to track whether positions have been modified
  const [positionsChanged, setPositionsChanged] = useState(false);

  // Create a ref to hold the latest task positions for unmount handling
  const taskPositionsRef = useRef<Record<string, { start: string, end: string }>>({});

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

  // Synchronize database aggressively when component unmounts or tab changes
  useEffect(() => {
    // Function to synchronize all task positions to the database
    const syncPositionsToDatabase = async () => {
      if (!positionsChanged || !myEvents.length) return;
      
      // Create a batch of promises for all database updates
      const updatePromises = myEvents.map(event => {
        return fetch(`/api/tasks/${event.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: event.start.toISOString(),
            dueDate: event.end.toISOString(),
            isAllDay: event.allDay || false,
          }),
        }).then(response => {
          if (!response.ok) {
            throw new Error(`Failed to update task ${event.id}`);
          }
          return event.id;
        }).catch(error => {
          console.error(`Error updating task ${event.id}:`, error);
          return null;
        });
      });

      // Execute all updates in parallel
      try {
        const results = await Promise.allSettled(updatePromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
        console.log(`Synced ${successCount}/${myEvents.length} task positions to database`);
        setPositionsChanged(false);
      } catch (error) {
        console.error('Error syncing positions to database:', error);
      }
    };

    // Add event listener for before page unload
    const handleBeforeUnload = () => {
      // Store positions in the global object for persistence
      myEvents.forEach(event => {
        globalTaskPositions[event.id] = {
          start: event.start.toISOString(),
          end: event.end.toISOString()
        };
      });
      
      // Update taskPositionsRef for unmount handler
      taskPositionsRef.current = { ...globalTaskPositions };
      
      // We can't await in beforeunload, so we use sync localStorage as fallback
      try {
        localStorage.setItem('calendar_task_positions', JSON.stringify(globalTaskPositions));
        localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString());
      } catch (err) {
        console.warn('Error saving positions before unload:', err);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    // Set up cleanup function for component unmount
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Use the ref to get latest positions (closures would use stale values)
      syncPositionsToDatabase();
      
      // Update global storage as backup
      Object.assign(globalTaskPositions, taskPositionsRef.current);
    };
  }, [myEvents, positionsChanged]);

  // Initialize events from tasks
  useEffect(() => {
    if (!tasks?.length) return

    // First check our global positions object (in-memory state)
    if (Object.keys(globalTaskPositions).length > 0) {
      console.log('Using global task positions from memory');
      
      // Apply stored positions to current tasks
      const newEvents = tasks.map(task => {
        const storedPosition = globalTaskPositions[task.id];
        
        // Use stored position if available, otherwise use task data
        let start, end;
        if (storedPosition) {
          start = new Date(storedPosition.start);
          end = new Date(storedPosition.end);
        } else {
          start = task.startDate ? new Date(task.startDate) : startOfDay(new Date());
          end = task.dueDate ? new Date(task.dueDate) : addHours(start, 1);
        }
        
        // Ensure valid dates
        if (isNaN(start.getTime())) {
          start = startOfDay(new Date());
        }
        if (isNaN(end.getTime())) {
          end = addHours(start, 1);
        }
        
        // Ensure end is after start
        if (end <= start) {
          end = addHours(start, 1);
        }
        
        return {
          id: task.id,
          title: task.title,
          start,
          end,
          allDay: false,
          priority: task.priority,
        };
      });
      
      // Sort events
      newEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
      setMyEvents(newEvents);
      return; // Early return if we used in-memory positions
    }

    // Then try localStorage as fallback
    if (typeof window !== 'undefined') {
      try {
        const storedTaskPositions = localStorage.getItem('calendar_task_positions');
        const timestamp = localStorage.getItem('calendar_task_positions_timestamp');
        
        if (storedTaskPositions && timestamp) {
          const taskPositionMap = JSON.parse(storedTaskPositions);
          const lastUpdate = new Date(timestamp);
          const oneDayAgo = new Date();
          oneDayAgo.setDate(oneDayAgo.getDate() - 1);
          
          // Use stored positions if they're less than a day old
          if (lastUpdate > oneDayAgo) {
            console.log('Using task positions from localStorage');
            // Load into global state for future use
            globalTaskPositions = { ...taskPositionMap };
            
            // Apply stored positions to current tasks (same code as above)
            const newEvents = tasks.map(task => {
              const storedPosition = taskPositionMap[task.id];
              
              // Use stored position if available, otherwise use task data
              let start, end;
              if (storedPosition) {
                start = new Date(storedPosition.start);
                end = new Date(storedPosition.end);
              } else {
                start = task.startDate ? new Date(task.startDate) : startOfDay(new Date());
                end = task.dueDate ? new Date(task.dueDate) : addHours(start, 1);
              }
              
              // Ensure valid dates
              if (isNaN(start.getTime())) {
                start = startOfDay(new Date());
              }
              if (isNaN(end.getTime())) {
                end = addHours(start, 1);
              }
              if (end <= start) {
                end = addHours(start, 1);
              }
              
              return {
                id: task.id,
                title: task.title,
                start,
                end,
                allDay: false,
                priority: task.priority,
              };
            });
            
            // Sort events
            newEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
            setMyEvents(newEvents);
            return; // Early return if we used stored positions
          }
        }
      } catch (error) {
        console.warn('Failed to load events from localStorage:', error);
      }
    }
    
    // If no stored events, use task data from props
    console.log('Using task positions from database');
    const newEvents = tasks.map(task => {
      let start = task.startDate ? new Date(task.startDate) : startOfDay(new Date());
      let end = task.dueDate ? new Date(task.dueDate) : addHours(start, 1);

      // Ensure valid dates
      if (isNaN(start.getTime())) {
        console.warn('Invalid start date for task:', task);
        start = startOfDay(new Date());
      }
      if (isNaN(end.getTime())) {
        end = addHours(start, 1);
      }
      if (end <= start) {
        end = addHours(start, 1);
      }

      return {
        id: task.id,
        title: task.title,
        start,
        end,
        allDay: false,
        priority: task.priority,
      };
    });

    // Store initial positions in global state
    newEvents.forEach(event => {
      globalTaskPositions[event.id] = {
        start: event.start.toISOString(),
        end: event.end.toISOString()
      };
    });
    
    // Sort events to ensure consistent rendering
    newEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
    
    setMyEvents(newEvents);
  }, [tasks]);

  // Update global positions whenever events change
  useEffect(() => {
    if (!myEvents.length) return;
    
    // Update the ref for unmount handler
    const newPositions: Record<string, { start: string, end: string }> = {};
    myEvents.forEach(event => {
      newPositions[event.id] = {
        start: event.start.toISOString(),
        end: event.end.toISOString()
      };
    });
    
    taskPositionsRef.current = newPositions;
    
    // Also update global variable
    Object.assign(globalTaskPositions, newPositions);
    
    // Also update localStorage as backup
    try {
      localStorage.setItem('calendar_task_positions', JSON.stringify(newPositions));
      localStorage.setItem('calendar_task_positions_timestamp', new Date().toISOString());
    } catch (error) {
      console.warn('Failed to save positions to localStorage:', error);
    }
  }, [myEvents]);

  const moveEvent = useCallback(
    async ({ event, start, end, isAllDay: droppedOnAllDaySlot = false }: any) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      // Optimistically update UI
      const updatedEvent = { 
        ...event, 
        start: startDate,
        end: endDate,
        allDay: droppedOnAllDaySlot
      };

      // Update events in state immediately
      setMyEvents(prev => {
        const filtered = prev.filter(ev => ev.id !== event.id);
        const updatedEvents = [...filtered, updatedEvent];
        return updatedEvents;
      });
      
      // Mark that positions have changed and need database sync
      setPositionsChanged(true);

      // Update global storage immediately
      globalTaskPositions[event.id] = {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
      
      // Also try database update, but don't revert UI on failure
      try {
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
        });

        if (response.ok) {
          toast.success('Task updated successfully');
          // If successful, we don't need to sync this task on unmount
          setPositionsChanged(false);
        } else {
          const errorData = await response.json();
          console.warn('Database update failed:', errorData);
          // We'll rely on the component unmount sync
        }
      } catch (error) {
        console.error(`Error updating task:`, error);
        toast.error('Changes saved locally. Will try to sync later.');
      }
    },
    []
  );

  const resizeEvent = useCallback(
    async ({ event, start, end }: any) => {
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      // Optimistically update UI
      const updatedEvent = { 
        ...event, 
        start: startDate,
        end: endDate,
        allDay: false
      };

      // Update events in state
      setMyEvents(prev => {
        const filtered = prev.filter(ev => ev.id !== event.id);
        const updatedEvents = [...filtered, updatedEvent];
        return updatedEvents;
      });

      // Mark that positions have changed and need database sync
      setPositionsChanged(true);

      // Update global storage immediately
      globalTaskPositions[event.id] = {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      };
      
      // Also try database update, but don't revert UI on failure
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
        });

        if (response.ok) {
          toast.success('Task updated successfully');
          // If successful, we don't need to sync this task on unmount
          setPositionsChanged(false);
        } else {
          const errorData = await response.json();
          console.warn('Database update failed:', errorData);
          // We'll rely on the component unmount sync
        }
      } catch (error) {
        console.error('Error updating task:', error);
        toast.error('Changes saved locally. Will try to sync later.');
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