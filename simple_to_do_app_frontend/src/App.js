import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "kavia.todo.v1";

/**
 * @typedef {"all" | "active" | "completed"} Filter
 */

/**
 * @typedef {Object} Todo
 * @property {string} id
 * @property {string} title
 * @property {boolean} completed
 * @property {number} createdAt
 */

/**
 * @typedef {Object} AppState
 * @property {Todo[]} todos
 * @property {Filter} filter
 */

const initialState = /** @type {AppState} */ ({
  todos: [],
  filter: "all",
});

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function loadFromStorage() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return safeJsonParse(raw);
}

function saveToStorage(state) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function generateId() {
  // Uses crypto when available, otherwise falls back to timestamp+random.
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * @typedef {Object} Action
 * @property {string} type
 * @property {any} [payload]
 */

function normalizeLoadedState(loaded) {
  if (!loaded || typeof loaded !== "object") return null;

  const maybeTodos = Array.isArray(loaded.todos) ? loaded.todos : null;
  const maybeFilter = loaded.filter;

  const normalizedTodos =
    maybeTodos?.map((t) => ({
      id: typeof t.id === "string" ? t.id : generateId(),
      title: typeof t.title === "string" ? t.title : "",
      completed: Boolean(t.completed),
      createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    })) ?? null;

  const normalizedFilter =
    maybeFilter === "all" || maybeFilter === "active" || maybeFilter === "completed"
      ? maybeFilter
      : "all";

  if (!normalizedTodos) return null;

  return /** @type {AppState} */ ({
    todos: normalizedTodos.filter((t) => t.title.trim().length > 0),
    filter: normalizedFilter,
  });
}

/**
 * Reducer handles all state transitions for predictable behavior + persistence.
 * @param {AppState} state
 * @param {Action} action
 * @returns {AppState}
 */
function reducer(state, action) {
  switch (action.type) {
    case "hydrate": {
      const next = normalizeLoadedState(action.payload);
      return next ?? state;
    }
    case "add": {
      const title = String(action.payload?.title ?? "").trim();
      if (!title) return state;
      const todo = /** @type {Todo} */ ({
        id: generateId(),
        title,
        completed: false,
        createdAt: Date.now(),
      });
      return { ...state, todos: [todo, ...state.todos] };
    }
    case "toggle": {
      const id = String(action.payload?.id ?? "");
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
      };
    }
    case "delete": {
      const id = String(action.payload?.id ?? "");
      return { ...state, todos: state.todos.filter((t) => t.id !== id) };
    }
    case "edit": {
      const id = String(action.payload?.id ?? "");
      const title = String(action.payload?.title ?? "").trim();
      if (!title) {
        // If user clears title, treat as delete to avoid empty todos.
        return { ...state, todos: state.todos.filter((t) => t.id !== id) };
      }
      return {
        ...state,
        todos: state.todos.map((t) => (t.id === id ? { ...t, title } : t)),
      };
    }
    case "clearCompleted": {
      return { ...state, todos: state.todos.filter((t) => !t.completed) };
    }
    case "toggleAll": {
      const shouldCompleteAll = state.todos.some((t) => !t.completed);
      return { ...state, todos: state.todos.map((t) => ({ ...t, completed: shouldCompleteAll })) };
    }
    case "setFilter": {
      const filter = action.payload?.filter;
      if (filter !== "all" && filter !== "active" && filter !== "completed") return state;
      return { ...state, filter };
    }
    default:
      return state;
  }
}

function getFilteredTodos(todos, filter) {
  switch (filter) {
    case "active":
      return todos.filter((t) => !t.completed);
    case "completed":
      return todos.filter((t) => t.completed);
    case "all":
    default:
      return todos;
  }
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

// PUBLIC_INTERFACE
function App() {
  /** @type {[AppState, React.Dispatch<Action>]} */
  const [state, dispatch] = useReducer(reducer, initialState);

  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState("");

  // Live region for lightweight announcements (add/delete etc.)
  const [announce, setAnnounce] = useState("");

  const inputRef = useRef(null);
  const editInputRef = useRef(null);

  // Hydrate once.
  useEffect(() => {
    const loaded = loadFromStorage();
    if (loaded) dispatch({ type: "hydrate", payload: loaded });
  }, []);

  // Persist whenever state changes.
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const filteredTodos = useMemo(
    () => getFilteredTodos(state.todos, state.filter),
    [state.todos, state.filter]
  );

  const activeCount = useMemo(() => state.todos.filter((t) => !t.completed).length, [state.todos]);
  const completedCount = useMemo(
    () => state.todos.filter((t) => t.completed).length,
    [state.todos]
  );

  useEffect(() => {
    // Keep focus where it should be for productivity.
    if (!editingId && inputRef.current) inputRef.current.focus();
  }, [editingId]);

  useEffect(() => {
    if (editingId && editInputRef.current) editInputRef.current.focus();
  }, [editingId]);

  function brieflyAnnounce(message) {
    setAnnounce(message);
    window.clearTimeout(brieflyAnnounce._t);
    brieflyAnnounce._t = window.setTimeout(() => setAnnounce(""), 1200);
  }

  // PUBLIC_INTERFACE
  const handleAdd = (e) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;

    dispatch({ type: "add", payload: { title } });
    setNewTitle("");
    brieflyAnnounce(`Added task: ${title}`);
  };

  // PUBLIC_INTERFACE
  const startEditing = (todo) => {
    setEditingId(todo.id);
    setEditingValue(todo.title);
  };

  // PUBLIC_INTERFACE
  const commitEditing = () => {
    if (!editingId) return;
    const nextTitle = editingValue.trim();
    const existing = state.todos.find((t) => t.id === editingId);
    dispatch({ type: "edit", payload: { id: editingId, title: nextTitle } });

    if (existing) {
      if (!nextTitle) {
        brieflyAnnounce(`Deleted task: ${existing.title}`);
      } else if (existing.title !== nextTitle) {
        brieflyAnnounce(`Renamed task to: ${nextTitle}`);
      }
    }

    setEditingId(null);
    setEditingValue("");
  };

  // PUBLIC_INTERFACE
  const cancelEditing = () => {
    setEditingId(null);
    setEditingValue("");
    brieflyAnnounce("Edit cancelled");
  };

  // PUBLIC_INTERFACE
  const onEditKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEditing();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEditing();
    }
  };

  // PUBLIC_INTERFACE
  const onNewKeyDown = (e) => {
    if (e.key === "Escape") {
      setNewTitle("");
    }
  };

  const allCompleted = state.todos.length > 0 && state.todos.every((t) => t.completed);

  return (
    <div className="App">
      <a className="skip-link" href="#main">
        Skip to tasks
      </a>

      <div className="app-shell">
        <header className="app-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              ✓
            </div>
            <div className="brand-text">
              <h1 className="brand-title">To‑Do</h1>
              <p className="brand-subtitle">Organize work with calm, professional focus.</p>
            </div>
          </div>

          <div className="header-meta">
            <div className="stats" aria-label="Task counts">
              <span className="chip">
                <span className="chip-label">Active</span>
                <span className="chip-value">{activeCount}</span>
              </span>
              <span className="chip chip-amber">
                <span className="chip-label">Completed</span>
                <span className="chip-value">{completedCount}</span>
              </span>
            </div>
          </div>
        </header>

        <main id="main" className="app-main">
          <section className="panel" aria-label="Add a new task">
            <form className="add-form" onSubmit={handleAdd}>
              <label className="sr-only" htmlFor="new-todo">
                Add a task
              </label>

              <div className="add-row">
                <input
                  id="new-todo"
                  ref={inputRef}
                  className="text-input"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={onNewKeyDown}
                  placeholder="Add a task…"
                  autoComplete="off"
                  inputMode="text"
                />

                <button className="btn btn-primary" type="submit" disabled={!newTitle.trim()}>
                  Add
                </button>
              </div>

              <div className="toolbar" role="toolbar" aria-label="Task actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => dispatch({ type: "toggleAll" })}
                  disabled={state.todos.length === 0}
                  aria-pressed={allCompleted}
                >
                  {allCompleted ? "Mark all active" : "Mark all complete"}
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => {
                    dispatch({ type: "clearCompleted" });
                    brieflyAnnounce("Cleared completed tasks");
                  }}
                  disabled={completedCount === 0}
                >
                  Clear completed
                </button>
              </div>
            </form>
          </section>

          <section className="panel" aria-label="Task list">
            <div className="panel-header">
              <h2 className="panel-title">Tasks</h2>
              <div className="filters" role="tablist" aria-label="Filter tasks">
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.filter === "all"}
                  className={`filter ${state.filter === "all" ? "is-active" : ""}`}
                  onClick={() => dispatch({ type: "setFilter", payload: { filter: "all" } })}
                >
                  All
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.filter === "active"}
                  className={`filter ${state.filter === "active" ? "is-active" : ""}`}
                  onClick={() => dispatch({ type: "setFilter", payload: { filter: "active" } })}
                >
                  Active
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={state.filter === "completed"}
                  className={`filter ${state.filter === "completed" ? "is-active" : ""}`}
                  onClick={() => dispatch({ type: "setFilter", payload: { filter: "completed" } })}
                >
                  Completed
                </button>
              </div>
            </div>

            {state.todos.length === 0 ? (
              <div className="empty">
                <p className="empty-title">No tasks yet</p>
                <p className="empty-subtitle">Add your first task above to get started.</p>
              </div>
            ) : filteredTodos.length === 0 ? (
              <div className="empty">
                <p className="empty-title">Nothing here</p>
                <p className="empty-subtitle">Try a different filter.</p>
              </div>
            ) : (
              <ul className="todo-list" aria-label="Tasks">
                {filteredTodos.map((todo) => {
                  const isEditing = editingId === todo.id;
                  const checkboxId = `todo-check-${todo.id}`;
                  const labelId = `todo-label-${todo.id}`;

                  return (
                    <li key={todo.id} className={`todo ${todo.completed ? "is-completed" : ""}`}>
                      <div className="todo-left">
                        <input
                          id={checkboxId}
                          className="todo-check"
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => {
                            dispatch({ type: "toggle", payload: { id: todo.id } });
                            brieflyAnnounce(
                              todo.completed ? "Marked as active" : "Marked as completed"
                            );
                          }}
                          aria-labelledby={labelId}
                        />
                      </div>

                      <div className="todo-body">
                        {isEditing ? (
                          <div className="edit-row">
                            <label className="sr-only" htmlFor={`edit-${todo.id}`}>
                              Edit task title
                            </label>
                            <input
                              id={`edit-${todo.id}`}
                              ref={editInputRef}
                              className="text-input text-input-compact"
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={onEditKeyDown}
                              onBlur={commitEditing}
                              aria-describedby={`edit-hint-${todo.id}`}
                            />
                            <div id={`edit-hint-${todo.id}`} className="sr-only">
                              Press Enter to save. Press Escape to cancel.
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="todo-title"
                            id={labelId}
                            onClick={() => startEditing(todo)}
                            onKeyDown={(e) => {
                              // Provide explicit keyboard support for edit trigger.
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                startEditing(todo);
                              }
                            }}
                            aria-label={`Edit task: ${todo.title}`}
                          >
                            {todo.title}
                          </button>
                        )}
                      </div>

                      <div className="todo-actions" aria-label="Task actions">
                        {!isEditing ? (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              onClick={() => startEditing(todo)}
                              aria-label={`Edit ${todo.title}`}
                              title="Edit"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn-danger"
                              onClick={() => {
                                dispatch({ type: "delete", payload: { id: todo.id } });
                                brieflyAnnounce(`Deleted task: ${todo.title}`);
                              }}
                              aria-label={`Delete ${todo.title}`}
                              title="Delete"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="icon-btn"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={commitEditing}
                              aria-label="Save edit"
                              title="Save"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn-danger"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={cancelEditing}
                              aria-label="Cancel edit"
                              title="Cancel"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <footer className="panel-footer" aria-label="Task summary">
              <div className="summary">
                <span className="summary-strong">{activeCount}</span>{" "}
                {pluralize(activeCount, "item")} left
              </div>
              <div className="hint">Tip: Click a task title to edit. Enter saves, Esc cancels.</div>
            </footer>
          </section>
        </main>

        {/* Screen-reader friendly announcements */}
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {announce}
        </div>

        <footer className="app-footer">
          <span>Local-first • Stored in your browser</span>
        </footer>
      </div>
    </div>
  );
}

export default App;
