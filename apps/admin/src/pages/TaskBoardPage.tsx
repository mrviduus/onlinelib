import { useState, useEffect, useRef, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { adminApi, type BoardTaskDto } from '../api/client'

type Status = 'todo' | 'doing' | 'done'

const COLUMNS: { id: Status; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'Doing' },
  { id: 'done', label: 'Done' },
]

export function TaskBoardPage() {
  const [tasks, setTasks] = useState<BoardTaskDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    adminApi.getBoardTasks()
      .then(setTasks)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const tasksForColumn = useCallback((status: Status) =>
    tasks.filter(t => t.status === status).sort((a, b) => a.order - b.order),
    [tasks]
  )

  const handleCreate = async (title: string, source?: string) => {
    try {
      const task = await adminApi.createBoardTask(title, source)
      setTasks(prev => [...prev, task])
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleUpdate = async (id: string, title: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, title } : t))
    try {
      await adminApi.updateBoardTask(id, title)
    } catch (err: any) {
      setError(err.message)
      // Refetch on error
      const fresh = await adminApi.getBoardTasks()
      setTasks(fresh)
    }
  }

  const handleDelete = async (id: string) => {
    const prev = tasks
    setTasks(tasks.filter(t => t.id !== id))
    try {
      await adminApi.deleteBoardTask(id)
    } catch (err: any) {
      setError(err.message)
      setTasks(prev)
    }
  }

  const resolveColumn = (id: string): Status | null => {
    const task = tasks.find(t => t.id === id)
    if (task) return task.status as Status
    if (COLUMNS.some(c => c.id === id)) return id as Status
    return null
  }

  const commitColumn = (column: Status, columnTasks: BoardTaskDto[]) => {
    const renumbered = columnTasks.map((t, i) => ({ ...t, order: i }))
    setTasks(prev => [...prev.filter(t => t.status !== column), ...renumbered])
    adminApi.reorderBoardTasks(
      renumbered.map(t => ({ id: t.id, status: t.status, order: t.order }))
    ).catch(err => setError(err.message))
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event
    if (!over) return

    const activeColumn = resolveColumn(active.id as string)
    const overColumn = resolveColumn(over.id as string)

    if (!activeColumn || !overColumn || activeColumn === overColumn) return

    setTasks(prev => prev.map(t => {
      if (t.id !== active.id) return t
      const maxOrder = Math.max(0, ...prev.filter(x => x.status === overColumn && x.id !== t.id).map(x => x.order + 1))
      return { ...t, status: overColumn, order: maxOrder }
    }))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const activeTask = tasks.find(t => t.id === active.id)
    if (!activeTask) return

    const column = activeTask.status as Status
    const columnTasks = tasksForColumn(column)
    const activeIndex = columnTasks.findIndex(t => t.id === active.id)
    const overIndex = COLUMNS.some(c => c.id === over.id)
      ? columnTasks.length - 1
      : columnTasks.findIndex(t => t.id === over.id)

    const needsReorder = activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex
    commitColumn(column, needsReorder ? arrayMove(columnTasks, activeIndex, overIndex) : columnTasks)
  }

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null

  if (loading) {
    return (
      <div className="task-board-page">
        <h1>Task Board</h1>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="task-board-page">
      <h1>Task Board</h1>
      {error && (
        <div className="error-banner" style={{ marginBottom: '1rem' }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', cursor: 'pointer' }}>&times;</button>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="task-board">
          {COLUMNS.map(col => (
            <KanbanColumn
              key={col.id}
              id={col.id}
              label={col.label}
              tasks={tasksForColumn(col.id)}
              onCreate={col.id === 'todo' ? handleCreate : undefined}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? <TaskCardOverlay task={activeTask} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

function KanbanColumn({
  id,
  label,
  tasks,
  onCreate,
  onUpdate,
  onDelete,
}: {
  id: Status
  label: string
  tasks: BoardTaskDto[]
  onCreate?: (title: string, source?: string) => void
  onUpdate: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <div className="task-column" ref={setNodeRef}>
      <div className="task-column__header">
        <span className="task-column__title">{label}</span>
        <span className="task-column__count">{tasks.length}</span>
      </div>
      {onCreate && <TaskInput onSubmit={onCreate} />}
      <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div className="task-column__list">
          {tasks.length === 0 && !onCreate && (
            <div className="task-column__empty">No tasks</div>
          )}
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onUpdate={onUpdate}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  )
}

function TaskInput({ onSubmit }: { onSubmit: (title: string, source?: string) => void }) {
  const [value, setValue] = useState('')
  const [listening, setListening] = useState(false)
  const [fromVoice, setFromVoice] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const speechSupported = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  useEffect(() => {
    if (!speechSupported) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SR()
    recognition.lang = 'en-US'
    recognition.interimResults = false
    recognition.onresult = (e) => {
      const text = e.results[0][0].transcript
      setValue(prev => prev ? prev + ' ' + text : text)
      setFromVoice(true)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
  }, [])

  const toggleVoice = () => {
    if (listening) {
      recognitionRef.current?.stop()
    } else {
      recognitionRef.current?.start()
      setListening(true)
    }
  }

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed, fromVoice ? 'voice' : undefined)
    setValue('')
    setFromVoice(false)
    inputRef.current?.focus()
  }

  return (
    <div className="task-input">
      <input
        ref={inputRef}
        type="text"
        className="task-input__field"
        placeholder="Add a task..."
        value={value}
        onChange={e => { setValue(e.target.value); setFromVoice(false) }}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
      />
      {speechSupported && (
        <button
          className={`task-input__voice ${listening ? 'task-input__voice--active' : ''}`}
          onClick={toggleVoice}
          title={listening ? 'Stop recording' : 'Voice input'}
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
      )}
      <button className="task-input__btn" onClick={handleSubmit} disabled={!value.trim()}>
        +
      </button>
    </div>
  )
}

function TaskCard({
  task,
  onUpdate,
  onDelete,
}: {
  task: BoardTaskDto
  onUpdate: (id: string, title: string) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(task.title)
  const inputRef = useRef<HTMLInputElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleSave = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, trimmed)
    } else {
      setEditValue(task.title)
    }
    setEditing(false)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? 'task-card--dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="task-card__edit-input"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave()
            if (e.key === 'Escape') { setEditValue(task.title); setEditing(false) }
          }}
        />
      ) : (
        <span className="task-card__title" onDoubleClick={() => setEditing(true)}>
          {task.title}
        </span>
      )}
      <button
        className="task-card__delete"
        onClick={e => { e.stopPropagation(); onDelete(task.id) }}
        title="Delete task"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}

function TaskCardOverlay({ task }: { task: BoardTaskDto }) {
  return (
    <div className="task-card task-card--overlay">
      <span className="task-card__title">{task.title}</span>
    </div>
  )
}
