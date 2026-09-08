import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Schedule } from '../services/companyService';
import {
  DAY_SHORT,
  MONTH_SHORT,
  MINUTES_PER_DAY,
  VIEW_LABELS,
  VIEW_SHORTCUTS,
  addDays,
  colorIndex,
  dateKey,
  daysBetween,
  daysInMonth,
  formatMinutes,
  formatRange,
  groupByDate,
  layoutDay,
  minutesFromTime,
  monthMatrix,
  occurrencesInRange,
  parseKey,
  rangeTitle,
  shiftAnchor,
  startOfMonth,
  timeFromMinutes,
  todayKey,
  viewRange,
  visibleDays,
  type CalendarView,
  type Occurrence,
} from '../utils/scheduleCalendar';
import './ScheduleCalendar.css';

export interface CalendarDraft {
  date: string;
  start_time: string;
  end_time: string;
}

export interface CalendarMove {
  start_date: string;
  end_date: string | null;
  start_time: string;
  end_time: string;
}

export interface ScheduleCalendarProps {
  schedules: Schedule[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  /** An empty slot was selected: open the existing Add Schedule form, pre-filled. */
  onCreate: (draft: CalendarDraft) => void;
  onSelect: (schedule: Schedule, date: string) => void;
  onMove: (schedule: Schedule, next: CalendarMove) => void | Promise<void>;
  /**
   * null when the schedule may be dragged by `dayDelta` days, otherwise the
   * reason it may not. The parent owns that rule because it depends on what the
   * save RPC will accept.
   */
  dragBlockedReason: (schedule: Schedule, dayDelta: number) => string | null;
  /** Suppressed while a modal owns the keyboard. */
  shortcutsEnabled: boolean;
  addButton: React.ReactNode;
  integrationChip: { label: string; tone: 'connected' | 'warning' | 'idle' };
  integrationPanel: React.ReactNode;
}

type Density = 'comfortable' | 'compact';

interface Preferences {
  view: CalendarView;
  showWeekends: boolean;
  showCancelled: boolean;
  showCompleted: boolean;
  hour12: boolean;
  weekStartsOn: 0 | 1;
  density: Density;
}

const DEFAULT_PREFERENCES: Preferences = {
  view: 'week',
  showWeekends: true,
  showCancelled: true,
  showCompleted: true,
  hour12: true,
  weekStartsOn: 0,
  density: 'comfortable',
};

const PREFERENCES_KEY = 'sil.schedule-calendar.preferences';
const VIEW_ORDER: CalendarView[] = ['day', 'week', 'month', 'year', 'schedule', 'four_days'];
/** Fallback until the rendered value of --gcal-hour has been read. */
const FALLBACK_HOUR_HEIGHT = 52;
/** Where a time view opens: the start of the OJT working day. */
const FOCUS_MINUTES = 7 * 60;
const SNAP_MINUTES = 15;
const MONTH_CHIP_LIMIT = 3;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DRAG_PAYLOAD = 'application/x-sil-schedule';

const readPreferences = (): Preferences => {
  try {
    const stored = window.localStorage.getItem(PREFERENCES_KEY);
    if (!stored) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(stored) as Partial<Preferences>;
    const view = VIEW_ORDER.includes(parsed.view as CalendarView) ? (parsed.view as CalendarView) : DEFAULT_PREFERENCES.view;
    return { ...DEFAULT_PREFERENCES, ...parsed, view };
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

const gmtLabel = () => {
  const offset = -new Date().getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const hours = Math.floor(Math.abs(offset) / 60);
  const minutes = Math.abs(offset) % 60;
  return `GMT${sign}${hours}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}`;
};

const Icon = {
  prev: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>,
  next: <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>,
  search: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.65" y2="16.65" /></svg>,
  help: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.6 2.3-2.6 4" /><line x1="12" y1="17.4" x2="12" y2="17.5" /></svg>,
  settings: <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  caret: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
  check: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
  close: <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

const studentName = (student: { first_name: string | null; last_name: string | null }) =>
  [student.first_name, student.last_name].filter(Boolean).join(' ') || 'Unnamed student';

/** Fields the toolbar search looks through: title, students, supervisor, location. */
const searchHaystack = (schedule: Schedule) =>
  [
    schedule.name, schedule.location, schedule.supervisor_name, schedule.notes, schedule.status,
    schedule.source === 'google' ? 'google calendar' : 'local',
    ...schedule.assigned_students.flatMap(student => [studentName(student), student.course, student.department, student.email]),
  ].filter(Boolean).join(' ').toLowerCase();

const syncLabel = (schedule: Schedule) => {
  if (schedule.source === 'google') return 'From Google Calendar';
  switch (schedule.calendar_sync_status) {
    case 'synced': return 'Synced to Google Calendar';
    case 'pending': return 'Waiting to sync';
    case 'failed': return 'Sync failed';
    default: return 'Not synced';
  }
};

/** Closes a popover on an outside pointer press or Escape. */
const useDismiss = (open: boolean, close: () => void) => {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);
  return ref;
};

interface DragState {
  /** Occurrence the gesture started on, so the origin day stays known. */
  originKey: string;
  originDate: string;
  scheduleId: string;
  mode: 'move' | 'resize';
  date: string;
  startMinutes: number;
  endMinutes: number;
  /** Minutes between the grab point and the top of the event. */
  grabOffset: number;
  moved: boolean;
}

const ScheduleCalendar: React.FC<ScheduleCalendarProps> = ({
  schedules, loading, search, onSearchChange, onCreate, onSelect, onMove,
  dragBlockedReason, shortcutsEnabled, addButton, integrationChip, integrationPanel,
}) => {
  const [preferences, setPreferences] = useState<Preferences>(readPreferences);
  const [anchor, setAnchor] = useState(() => todayKey());
  const [now, setNow] = useState(() => new Date());
  const [openMenu, setOpenMenu] = useState<'view' | 'settings' | 'help' | null>(null);
  const [searchOpen, setSearchOpen] = useState(() => Boolean(search));
  const [integrationOpen, setIntegrationOpen] = useState(integrationChip.tone !== 'connected');
  const [peek, setPeek] = useState<{ date: string; x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const { view, showWeekends, showCancelled, showCompleted, hour12, weekStartsOn, density } = preferences;
  const [hourHeight, setHourHeight] = useState(FALLBACK_HOUR_HEIGHT);
  const today = dateKey(now);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrolledForRef = useRef<string>('');
  const dragRef = useRef<DragState | null>(null);
  /** Set when a drag actually moved, so the trailing click does not re-open the event. */
  const suppressClickRef = useRef(false);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences(current => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next)); } catch { /* private browsing */ }
      return next;
    });
  }, []);

  /*
   * The hour height lives in CSS so it can answer media queries — notably the
   * viewport-height ones that keep a working day on screen on a short laptop.
   * Event blocks are positioned in pixels, so the rendered value is read back
   * here rather than duplicated in JavaScript.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const read = () => {
      const parsed = Number.parseFloat(getComputedStyle(root).getPropertyValue('--gcal-hour'));
      if (Number.isFinite(parsed) && parsed > 0) setHourHeight(current => (current === parsed ? current : parsed));
    };
    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, [density]);

  /* Focus follows the search field once it exists — a timeout queued from the
     click would run before React has mounted the input. */
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  /* The current-time line only has to be accurate to the minute. */
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const viewMenuRef = useDismiss(openMenu === 'view', closeMenu);
  const settingsMenuRef = useDismiss(openMenu === 'settings', closeMenu);
  const helpMenuRef = useDismiss(openMenu === 'help', closeMenu);
  const closePeek = useCallback(() => setPeek(null), []);
  const peekRef = useDismiss(Boolean(peek), closePeek);

  const setView = useCallback((next: CalendarView) => {
    update({ view: next });
    setOpenMenu(null);
  }, [update]);

  /* ── Keyboard shortcuts ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!shortcutsEnabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      const key = event.key.toLowerCase();
      const shortcut = VIEW_ORDER.find(candidate => VIEW_SHORTCUTS[candidate].toLowerCase() === key);
      if (shortcut) { event.preventDefault(); setView(shortcut); return; }
      if (key === 't') { event.preventDefault(); setAnchor(todayKey()); return; }
      if (key === 'j' || event.key === 'PageDown') { event.preventDefault(); setAnchor(current => shiftAnchor(view, current, 1)); return; }
      if (key === 'k' || event.key === 'PageUp') { event.preventDefault(); setAnchor(current => shiftAnchor(view, current, -1)); return; }
      if (key === '/') { event.preventDefault(); setSearchOpen(true); searchInputRef.current?.focus(); return; }
      if (key === '?') { event.preventDefault(); setOpenMenu(current => (current === 'help' ? null : 'help')); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shortcutsEnabled, view, setView]);

  /* ── Occurrences for the current view ───────────────────────────────────── */
  const needle = search.trim().toLowerCase();
  const matched = useMemo(
    () => (needle ? new Set(schedules.filter(schedule => searchHaystack(schedule).includes(needle)).map(schedule => schedule.id)) : null),
    [schedules, needle],
  );

  const shown = useMemo(() => schedules.filter(schedule => {
    if (!showCancelled && schedule.status === 'cancelled') return false;
    if (!showCompleted && schedule.status === 'completed') return false;
    return true;
  }), [schedules, showCancelled, showCompleted]);

  const [rangeStart, rangeEnd] = viewRange(view, anchor, weekStartsOn);
  const occurrences = useMemo(() => occurrencesInRange(shown, rangeStart, rangeEnd), [shown, rangeStart, rangeEnd]);
  const byDate = useMemo(() => groupByDate(occurrences), [occurrences]);
  const matchCount = useMemo(
    () => (matched ? new Set(occurrences.filter(item => matched.has(item.schedule.id)).map(item => item.schedule.id)).size : 0),
    [occurrences, matched],
  );

  const allDays = visibleDays(view, anchor, weekStartsOn);
  const isTimeGrid = view === 'day' || view === 'week' || view === 'four_days';
  const columns = useMemo(
    () => (view === 'week' && !showWeekends ? allDays.filter(day => ![0, 6].includes(parseKey(day).getDay())) : allDays),
    [view, showWeekends, allDays],
  );
  const title = rangeTitle(view, columns, anchor);

  /*
   * A time view opens on the OJT working day rather than at midnight, and
   * earlier than 7 AM only when something is actually scheduled up there — so
   * nothing is hidden above the fold, and a normal day needs no scrolling.
   */
  useEffect(() => {
    if (!isTimeGrid) return;
    const signature = `${view}:${density}:${hourHeight}`;
    if (scrolledForRef.current === signature) return;
    const element = scrollRef.current;
    if (!element) return;
    scrolledForRef.current = signature;
    let earliest = FOCUS_MINUTES;
    for (const day of columns) {
      for (const item of byDate.get(day) || []) {
        if (!item.allDay && item.startMinutes < earliest) earliest = item.startMinutes;
      }
    }
    // Less the height of an hour label, so the top row's own label clears the
    // sticky header instead of hiding behind it.
    element.scrollTop = Math.max(0, (earliest / 60) * hourHeight - 14);
  }, [isTimeGrid, view, density, hourHeight, columns, byDate]);

  /* The other views start at their first row; the browser otherwise keeps the
     scroll offset of whichever view was on screen before. */
  useEffect(() => {
    if (isTimeGrid) return;
    const scroller = surfaceRef.current?.querySelector<HTMLElement>('.gcal-agenda, .gcal-month-grid, .gcal-year');
    if (scroller) scroller.scrollTop = 0;
  }, [isTimeGrid, view, anchor]);

  /* ── Creating from an empty slot ────────────────────────────────────────── */
  const minutesFromPointer = useCallback((element: HTMLElement, clientY: number) => {
    const rect = element.getBoundingClientRect();
    const raw = ((clientY - rect.top) / hourHeight) * 60;
    return Math.max(0, Math.min(MINUTES_PER_DAY - SNAP_MINUTES, Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES));
  }, [hourHeight]);

  const createAt = (date: string, startMinutes: number, durationMinutes = 60) =>
    onCreate({
      date,
      start_time: timeFromMinutes(startMinutes),
      end_time: timeFromMinutes(Math.min(MINUTES_PER_DAY - 1, startMinutes + durationMinutes)),
    });

  const onColumnClick = (event: React.MouseEvent<HTMLDivElement>, date: string) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if ((event.target as HTMLElement).closest('.gcal-event')) return;
    createAt(date, minutesFromPointer(event.currentTarget, event.clientY));
  };

  /* ── Drag to move, drag the bottom edge to resize ───────────────────────── */
  const commitDrag = (state: DragState) => {
    const schedule = schedules.find(item => item.id === state.scheduleId);
    if (!schedule?.start_date) return;
    const dayDelta = daysBetween(state.originDate, state.date);
    if (dragBlockedReason(schedule, dayDelta)) return;
    void onMove(schedule, {
      start_date: dayDelta ? addDays(schedule.start_date, dayDelta) : schedule.start_date,
      end_date: schedule.end_date && dayDelta ? addDays(schedule.end_date, dayDelta) : schedule.end_date,
      start_time: timeFromMinutes(state.startMinutes),
      end_time: timeFromMinutes(state.endMinutes),
    });
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>, occurrence: Occurrence<Schedule>, mode: 'move' | 'resize') => {
    // Touch keeps native scrolling and tap-to-open; dragging is a pointer gesture.
    if (event.pointerType === 'touch' || event.button !== 0) return;
    if (dragBlockedReason(occurrence.schedule, 0)) return;
    const column = (event.target as HTMLElement).closest<HTMLElement>('[data-grid="time"]');
    if (!column) return;
    event.stopPropagation();

    const duration = occurrence.endMinutes - occurrence.startMinutes;
    const initial: DragState = {
      originKey: occurrence.key,
      originDate: occurrence.date,
      scheduleId: occurrence.schedule.id,
      mode,
      date: occurrence.date,
      startMinutes: occurrence.startMinutes,
      endMinutes: occurrence.endMinutes,
      grabOffset: minutesFromPointer(column, event.clientY) - occurrence.startMinutes,
      moved: false,
    };
    dragRef.current = initial;
    setDrag(initial);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
      const overColumn = under instanceof Element ? under.closest<HTMLElement>('[data-grid="time"]') : null;
      const pointerMinutes = overColumn ? minutesFromPointer(overColumn, moveEvent.clientY) : null;
      const next: DragState = { ...current };
      if (mode === 'resize') {
        if (pointerMinutes !== null) next.endMinutes = Math.max(current.startMinutes + SNAP_MINUTES, pointerMinutes);
      } else {
        if (overColumn?.dataset.day) next.date = overColumn.dataset.day;
        if (pointerMinutes !== null) {
          next.startMinutes = Math.max(0, Math.min(MINUTES_PER_DAY - duration, pointerMinutes - current.grabOffset));
          next.endMinutes = next.startMinutes + duration;
        }
      }
      next.moved = next.date !== occurrence.date
        || next.startMinutes !== occurrence.startMinutes
        || next.endMinutes !== occurrence.endMinutes;
      dragRef.current = next;
      setDrag(next);
    };

    const onPointerUp = () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      const finished = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      if (finished?.moved) {
        suppressClickRef.current = true;
        commitDrag(finished);
      }
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  /* Month and all-day chips move in whole days, through the same commit path. */
  const moveByDays = (schedule: Schedule, fromDate: string, toDate: string) => {
    const dayDelta = daysBetween(fromDate, toDate);
    if (!dayDelta || !schedule.start_date) return;
    if (dragBlockedReason(schedule, dayDelta)) return;
    void onMove(schedule, {
      start_date: addDays(schedule.start_date, dayDelta),
      end_date: schedule.end_date ? addDays(schedule.end_date, dayDelta) : schedule.end_date,
      start_time: schedule.start_time || '08:00',
      end_time: schedule.end_time || '17:00',
    });
  };

  const dropOnDay = (event: React.DragEvent, date: string) => {
    const payload = event.dataTransfer.getData(DRAG_PAYLOAD);
    if (!payload) return;
    event.preventDefault();
    const separator = payload.lastIndexOf('|');
    const schedule = schedules.find(item => item.id === payload.slice(0, separator));
    if (schedule) moveByDays(schedule, payload.slice(separator + 1), date);
  };

  const allowDrop = (event: React.DragEvent) => {
    if (event.dataTransfer.types.includes(DRAG_PAYLOAD)) event.preventDefault();
  };

  /* ── Shared event rendering ─────────────────────────────────────────────── */
  const formatDayLabel = (day: string) => {
    const date = parseKey(day);
    return `${MONTH_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  };

  const eventClasses = (schedule: Schedule, extra = '') =>
    [
      `gcal-c${colorIndex(schedule.id)}`,
      schedule.status === 'cancelled' ? 'is-cancelled' : schedule.status === 'completed' ? 'is-completed' : '',
      schedule.source === 'google' ? 'is-google' : '',
      schedule.source !== 'google' && schedule.calendar_sync_status === 'failed' ? 'is-syncfailed' : '',
      matched ? (matched.has(schedule.id) ? 'is-hit' : 'is-dimmed') : '',
      extra,
    ].filter(Boolean).join(' ');

  const describe = (occurrence: Occurrence<Schedule>) =>
    [
      occurrence.schedule.name,
      formatDayLabel(occurrence.date),
      occurrence.allDay ? 'All day' : `${formatMinutes(occurrence.startMinutes, hour12)} – ${formatMinutes(occurrence.endMinutes, hour12)}`,
      occurrence.schedule.location || '',
      occurrence.schedule.supervisor_name ? `Supervisor: ${occurrence.schedule.supervisor_name}` : '',
      occurrence.schedule.status,
      syncLabel(occurrence.schedule),
    ].filter(Boolean).join(' · ');

  const renderTimedEvent = (
    occurrence: Occurrence<Schedule> & { column: number; columns: number },
    isPreview: boolean,
  ) => {
    const height = Math.max(((occurrence.endMinutes - occurrence.startMinutes) / 60) * hourHeight, 18);
    const width = 100 / occurrence.columns;
    const canDrag = !dragBlockedReason(occurrence.schedule, 0);
    return (
      <div
        key={occurrence.key}
        className={`gcal-event ${eventClasses(occurrence.schedule, [
          height < 34 ? 'is-tiny' : '',
          isPreview ? 'is-dragging' : '',
          canDrag ? 'can-drag' : '',
        ].filter(Boolean).join(' '))}`}
        style={{
          top: (occurrence.startMinutes / 60) * hourHeight,
          height,
          left: `calc(${occurrence.column * width}% + 2px)`,
          width: `calc(${width}% - 4px)`,
        }}
      >
        <button
          type="button"
          className="gcal-event-body"
          title={describe(occurrence)}
          onPointerDown={event => startDrag(event, occurrence, 'move')}
          onClick={() => {
            if (suppressClickRef.current) { suppressClickRef.current = false; return; }
            onSelect(occurrence.schedule, occurrence.date);
          }}
        >
          <span className="gcal-event-title">{occurrence.schedule.name}</span>
          <span className="gcal-event-time">{formatRange(occurrence.startMinutes, occurrence.endMinutes, hour12)}</span>
          {occurrence.schedule.location && height >= 64 && <span className="gcal-event-meta">{occurrence.schedule.location}</span>}
        </button>
        {canDrag && (
          <span
            className="gcal-event-handle"
            role="presentation"
            title="Drag to change the length"
            onPointerDown={event => startDrag(event, occurrence, 'resize')}
          />
        )}
      </div>
    );
  };

  const renderChip = (occurrence: Occurrence<Schedule>, options: { allDay?: boolean; showTime?: boolean } = {}) => (
    <button
      key={occurrence.key}
      type="button"
      className={`gcal-chip ${options.allDay ? 'is-allday' : ''} ${eventClasses(occurrence.schedule)}`}
      title={describe(occurrence)}
      draggable={!dragBlockedReason(occurrence.schedule, 1)}
      onDragStart={event => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData(DRAG_PAYLOAD, `${occurrence.schedule.id}|${occurrence.date}`);
      }}
      onClick={() => { setPeek(null); onSelect(occurrence.schedule, occurrence.date); }}
    >
      <span className="gcal-chip-dot" aria-hidden="true" />
      {options.showTime !== false && !options.allDay && (
        <span className="gcal-chip-time">{formatMinutes(occurrence.startMinutes, hour12)}</span>
      )}
      <span className="gcal-chip-title">{occurrence.schedule.name}</span>
    </button>
  );

  /* ── Views ──────────────────────────────────────────────────────────────── */
  const renderTimeGrid = () => {
    const allDayByColumn = columns.map(day => (byDate.get(day) || []).filter(item => item.allDay));
    const hasAllDay = allDayByColumn.some(items => items.length > 0);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    /* While a drag is live the event is drawn in the column it is being taken
       to, so the preview follows the pointer across days as well as times. */
    const timedFor = (day: string) => {
      let items = (byDate.get(day) || []).filter(item => !item.allDay);
      if (drag) {
        items = items.filter(item => item.key !== drag.originKey);
        const origin = occurrences.find(item => item.key === drag.originKey);
        if (origin && drag.date === day) {
          items = [...items, { ...origin, date: day, startMinutes: drag.startMinutes, endMinutes: drag.endMinutes }];
        }
      }
      return layoutDay(items);
    };

    return (
      <div
        className="gcal-timegrid"
        ref={scrollRef}
        style={{ ['--gcal-cols' as string]: columns.length }}
      >
        <div className="gcal-timegrid-inner">
          <div className="gcal-sticky-head">
            <div className="gcal-head-row">
              <div className="gcal-gutter-cell gcal-tz">{gmtLabel()}</div>
              {columns.map(day => {
                const date = parseKey(day);
                return (
                  <div
                    key={day}
                    className={`gcal-head-day ${day === today ? 'is-today' : ''} ${[0, 6].includes(date.getDay()) ? 'is-weekend' : ''}`}
                  >
                    <span className="gcal-head-name">{DAY_SHORT[date.getDay()]}</span>
                    <button
                      type="button"
                      className="gcal-head-number"
                      aria-label={`Open ${formatDayLabel(day)}`}
                      onClick={() => { setAnchor(day); setView('day'); }}
                    >
                      {date.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
            {hasAllDay && (
              <div className="gcal-allday-row">
                <div className="gcal-gutter-cell gcal-allday-label">All day</div>
                {columns.map((day, index) => (
                  <div key={day} className="gcal-allday-cell" onDragOver={allowDrop} onDrop={event => dropOnDay(event, day)}>
                    {allDayByColumn[index].map(item => renderChip(item, { allDay: true }))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="gcal-body-row">
            <div className="gcal-gutter">
              {HOURS.map(hour => (
                <div key={hour} className="gcal-gutter-hour">
                  {hour > 0 && <span>{formatMinutes(hour * 60, hour12)}</span>}
                </div>
              ))}
            </div>
            {columns.map(day => (
              <div
                key={day}
                className={`gcal-col ${day === today ? 'is-today' : ''} ${[0, 6].includes(parseKey(day).getDay()) ? 'is-weekend' : ''}`}
                data-day={day}
                data-grid="time"
                onClick={event => onColumnClick(event, day)}
                onDragOver={allowDrop}
                onDrop={event => dropOnDay(event, day)}
              >
                {timedFor(day).map(item => renderTimedEvent(item, Boolean(drag) && item.key === drag?.originKey))}
                {day === today && (
                  <div className="gcal-now" style={{ top: (nowMinutes / 60) * hourHeight }} aria-hidden="true">
                    <span className="gcal-now-dot" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderMonth = () => {
    const cells = monthMatrix(anchor, weekStartsOn);
    const weekend = (day: string) => [0, 6].includes(parseKey(day).getDay());
    const headers = showWeekends ? cells.slice(0, 7) : cells.slice(0, 7).filter(day => !weekend(day));
    const visibleCells = showWeekends ? cells : cells.filter(day => !weekend(day));
    const currentMonth = startOfMonth(anchor).slice(0, 7);
    return (
      <div className="gcal-month" style={{ ['--gcal-cols' as string]: headers.length }}>
        <div className="gcal-month-head">
          {headers.map(day => <div key={day}>{DAY_SHORT[parseKey(day).getDay()]}</div>)}
        </div>
        <div className="gcal-month-grid">
          {visibleCells.map(day => {
            const items = byDate.get(day) || [];
            return (
              <div
                key={day}
                className={`gcal-month-cell ${day.slice(0, 7) !== currentMonth ? 'is-outside' : ''} ${day === today ? 'is-today' : ''}`}
                onClick={event => {
                  if ((event.target as HTMLElement).closest('button')) return;
                  createAt(day, minutesFromTime('08:00'), 540);
                }}
                onDragOver={allowDrop}
                onDrop={event => dropOnDay(event, day)}
              >
                <div className="gcal-month-daynum">
                  {day.endsWith('-01') && <span className="gcal-month-monthname">{MONTH_SHORT[parseKey(day).getMonth()]}</span>}
                  <button type="button" aria-label={`Open ${formatDayLabel(day)}`} onClick={() => { setAnchor(day); setView('day'); }}>
                    {parseKey(day).getDate()}
                  </button>
                </div>
                <div className="gcal-month-events">
                  {items.slice(0, MONTH_CHIP_LIMIT).map(item => renderChip(item, { allDay: item.allDay }))}
                  {items.length > MONTH_CHIP_LIMIT && (
                    <button
                      type="button"
                      className="gcal-more"
                      onClick={event => setPeek({ date: day, x: event.clientX, y: event.clientY })}
                    >
                      +{items.length - MONTH_CHIP_LIMIT} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderYear = () => {
    const year = anchor.slice(0, 4);
    const counted = new Map<string, number>();
    for (const item of occurrences) counted.set(item.date, (counted.get(item.date) || 0) + 1);
    return (
      <div className="gcal-year">
        {Array.from({ length: 12 }, (_, month) => {
          const monthKey = `${year}-${String(month + 1).padStart(2, '0')}-01`;
          const cells = monthMatrix(monthKey, weekStartsOn);
          const lastDay = `${monthKey.slice(0, 7)}-${String(daysInMonth(monthKey)).padStart(2, '0')}`;
          const rows = Math.ceil((cells.indexOf(lastDay) + 1) / 7);
          return (
            <section key={month} className="gcal-mini">
              <button type="button" className="gcal-mini-title" onClick={() => { setAnchor(monthKey); setView('month'); }}>
                {MONTH_SHORT[month]}
              </button>
              <div className="gcal-mini-head">
                {cells.slice(0, 7).map(day => <span key={day}>{DAY_SHORT[parseKey(day).getDay()].charAt(0)}</span>)}
              </div>
              <div className="gcal-mini-grid">
                {cells.slice(0, rows * 7).map(day => {
                  const count = counted.get(day) || 0;
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`gcal-mini-day ${day.slice(0, 7) !== monthKey.slice(0, 7) ? 'is-outside' : ''} ${day === today ? 'is-today' : ''} ${count ? 'has-events' : ''}`}
                      onClick={() => { setAnchor(day); setView('day'); }}
                      aria-label={`${formatDayLabel(day)}${count ? `, ${count} scheduled` : ''}`}
                    >
                      {parseKey(day).getDate()}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderAgenda = () => {
    const days = [...byDate.keys()].sort();
    if (!days.length) {
      return (
        <div className="gcal-empty">
          <strong>Nothing scheduled</strong>
          <p>No schedules fall in the four months from {formatDayLabel(anchor)}. Select a slot on the calendar, or use Add Schedule, to create one.</p>
        </div>
      );
    }
    return (
      <div className="gcal-agenda">
        {days.map(day => {
          const date = parseKey(day);
          return (
            <section key={day} className={`gcal-agenda-day ${day === today ? 'is-today' : ''}`}>
              <div className="gcal-agenda-date">
                <span className="gcal-agenda-num">{date.getDate()}</span>
                <span className="gcal-agenda-dow">{DAY_SHORT[date.getDay()]}</span>
                <span className="gcal-agenda-month">{MONTH_SHORT[date.getMonth()]}</span>
              </div>
              <ul className="gcal-agenda-list">
                {(byDate.get(day) || []).map(item => (
                  <li key={item.key}>
                    <span className="gcal-agenda-time">{item.allDay ? 'All day' : formatMinutes(item.startMinutes, hour12)}</span>
                    <button
                      type="button"
                      className={`gcal-agenda-event ${eventClasses(item.schedule)}`}
                      title={describe(item)}
                      onClick={() => onSelect(item.schedule, item.date)}
                    >
                      <span className="gcal-agenda-title">{item.schedule.name}</span>
                      <span className="gcal-agenda-meta">
                        {!item.allDay && `${formatRange(item.startMinutes, item.endMinutes, hour12)} · `}
                        {item.schedule.supervisor_name || item.schedule.location || syncLabel(item.schedule)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`gcal ${density === 'compact' ? 'is-compact' : ''} ${drag ? 'is-dragging' : ''}`} ref={rootRef}>
      <div className="gcal-toolbar">
        <div className="gcal-toolbar-nav">
          <button type="button" className="gcal-today" onClick={() => setAnchor(todayKey())}>Today</button>
          <div className="gcal-arrows">
            <button type="button" aria-label="Previous period" onClick={() => setAnchor(current => shiftAnchor(view, current, -1))}>{Icon.prev}</button>
            <button type="button" aria-label="Next period" onClick={() => setAnchor(current => shiftAnchor(view, current, 1))}>{Icon.next}</button>
          </div>
          <h2 className="gcal-title" aria-live="polite">{title}</h2>
        </div>

        <div className="gcal-toolbar-actions">
          <button
            type="button"
            className={`gcal-icon-btn ${searchOpen ? 'is-active' : ''}`}
            aria-label="Search schedules"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(open => {
              if (open) onSearchChange('');
              return !open;
            })}
          >
            {Icon.search}
          </button>

          <div className="gcal-menu-anchor" ref={helpMenuRef}>
            <button
              type="button"
              className={`gcal-icon-btn ${openMenu === 'help' ? 'is-active' : ''}`}
              aria-label="Calendar help and keyboard shortcuts"
              aria-haspopup="dialog"
              aria-expanded={openMenu === 'help'}
              onClick={() => setOpenMenu(current => (current === 'help' ? null : 'help'))}
            >
              {Icon.help}
            </button>
            {openMenu === 'help' && (
              <div className="gcal-menu gcal-help" role="dialog" aria-label="Calendar help">
                <p className="gcal-menu-heading">Keyboard shortcuts</p>
                <ul>
                  {VIEW_ORDER.map(item => <li key={item}><span>{VIEW_LABELS[item]} view</span><kbd>{VIEW_SHORTCUTS[item]}</kbd></li>)}
                  <li><span>Jump to today</span><kbd>T</kbd></li>
                  <li><span>Previous / next</span><kbd>K</kbd><kbd>J</kbd></li>
                  <li><span>Search</span><kbd>/</kbd></li>
                  <li><span>This panel</span><kbd>?</kbd></li>
                </ul>
                <p className="gcal-menu-heading">Tips</p>
                <ul className="gcal-help-tips">
                  <li>Select an empty slot to create a schedule at that time.</li>
                  <li>Drag a schedule to move it, or drag its bottom edge to change its length.</li>
                  <li>Moving a repeating schedule moves the whole series.</li>
                  <li>Events imported from Google Calendar are edited in Google.</li>
                </ul>
              </div>
            )}
          </div>

          <div className="gcal-menu-anchor" ref={settingsMenuRef}>
            <button
              type="button"
              className={`gcal-icon-btn ${openMenu === 'settings' ? 'is-active' : ''}`}
              aria-label="Calendar settings"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'settings'}
              onClick={() => setOpenMenu(current => (current === 'settings' ? null : 'settings'))}
            >
              {Icon.settings}
            </button>
            {openMenu === 'settings' && (
              <div className="gcal-menu" role="menu" aria-label="Calendar settings">
                <p className="gcal-menu-heading">Clock</p>
                <button type="button" role="menuitemradio" aria-checked={hour12} onClick={() => update({ hour12: true })}>
                  <span className="gcal-menu-check">{hour12 && Icon.check}</span>12-hour
                </button>
                <button type="button" role="menuitemradio" aria-checked={!hour12} onClick={() => update({ hour12: false })}>
                  <span className="gcal-menu-check">{!hour12 && Icon.check}</span>24-hour
                </button>
                <div className="gcal-menu-divider" />
                <p className="gcal-menu-heading">Week starts on</p>
                <button type="button" role="menuitemradio" aria-checked={weekStartsOn === 0} onClick={() => update({ weekStartsOn: 0 })}>
                  <span className="gcal-menu-check">{weekStartsOn === 0 && Icon.check}</span>Sunday
                </button>
                <button type="button" role="menuitemradio" aria-checked={weekStartsOn === 1} onClick={() => update({ weekStartsOn: 1 })}>
                  <span className="gcal-menu-check">{weekStartsOn === 1 && Icon.check}</span>Monday
                </button>
                <div className="gcal-menu-divider" />
                <p className="gcal-menu-heading">Row height</p>
                <button type="button" role="menuitemradio" aria-checked={density === 'comfortable'} onClick={() => update({ density: 'comfortable' })}>
                  <span className="gcal-menu-check">{density === 'comfortable' && Icon.check}</span>Comfortable
                </button>
                <button type="button" role="menuitemradio" aria-checked={density === 'compact'} onClick={() => update({ density: 'compact' })}>
                  <span className="gcal-menu-check">{density === 'compact' && Icon.check}</span>Compact
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className={`gcal-sync-chip tone-${integrationChip.tone} ${integrationOpen ? 'is-active' : ''}`}
            aria-expanded={integrationOpen}
            onClick={() => setIntegrationOpen(open => !open)}
          >
            <span className="gcal-sync-dot" aria-hidden="true" />
            <span className="gcal-sync-text">{integrationChip.label}</span>
          </button>

          <div className="gcal-menu-anchor" ref={viewMenuRef}>
            <button
              type="button"
              className="gcal-view-button"
              aria-haspopup="menu"
              aria-expanded={openMenu === 'view'}
              onClick={() => setOpenMenu(current => (current === 'view' ? null : 'view'))}
            >
              {VIEW_LABELS[view]}{Icon.caret}
            </button>
            {openMenu === 'view' && (
              <div className="gcal-menu gcal-view-menu" role="menu" aria-label="Calendar view">
                {VIEW_ORDER.map(item => (
                  <button key={item} type="button" role="menuitemradio" aria-checked={view === item} onClick={() => setView(item)}>
                    <span className="gcal-menu-check">{view === item && Icon.check}</span>
                    {VIEW_LABELS[item]}
                    <kbd>{VIEW_SHORTCUTS[item]}</kbd>
                  </button>
                ))}
                <div className="gcal-menu-divider" />
                <button type="button" role="menuitemcheckbox" aria-checked={showWeekends} onClick={() => update({ showWeekends: !showWeekends })}>
                  <span className="gcal-menu-check">{showWeekends && Icon.check}</span>Show weekends
                </button>
                <button type="button" role="menuitemcheckbox" aria-checked={showCancelled} onClick={() => update({ showCancelled: !showCancelled })}>
                  <span className="gcal-menu-check">{showCancelled && Icon.check}</span>Show cancelled
                </button>
                <button type="button" role="menuitemcheckbox" aria-checked={showCompleted} onClick={() => update({ showCompleted: !showCompleted })}>
                  <span className="gcal-menu-check">{showCompleted && Icon.check}</span>Show completed
                </button>
              </div>
            )}
          </div>

          {addButton}
        </div>
      </div>

      {searchOpen && (
        <div className="gcal-searchbar">
          <span className="gcal-searchbar-icon" aria-hidden="true">{Icon.search}</span>
          <input
            ref={searchInputRef}
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search schedules or students…"
            aria-label="Search schedules or students"
          />
          {needle && <span className="gcal-search-count">{matchCount} matching {matchCount === 1 ? 'schedule' : 'schedules'}</span>}
          <button type="button" aria-label="Close search" onClick={() => { onSearchChange(''); setSearchOpen(false); }}>{Icon.close}</button>
        </div>
      )}

      {integrationOpen && <div className="gcal-integration">{integrationPanel}</div>}

      <div className={`gcal-surface view-${view}`} ref={surfaceRef}>
        {loading
          ? <div className="gcal-loading" role="status">Loading schedules…</div>
          : view === 'month' ? renderMonth()
            : view === 'year' ? renderYear()
              : view === 'schedule' ? renderAgenda()
                : renderTimeGrid()}
      </div>

      {peek && (
        <div
          className="gcal-peek"
          ref={peekRef}
          role="dialog"
          aria-label={`Schedules on ${formatDayLabel(peek.date)}`}
          style={{
            left: Math.max(8, Math.min(peek.x - 60, window.innerWidth - 268)),
            top: Math.max(8, Math.min(peek.y - 40, window.innerHeight - 300)),
          }}
        >
          <header>
            <div>
              <span className="gcal-peek-dow">{DAY_SHORT[parseKey(peek.date).getDay()]}</span>
              <strong>{parseKey(peek.date).getDate()}</strong>
            </div>
            <button type="button" aria-label="Close" onClick={() => setPeek(null)}>{Icon.close}</button>
          </header>
          <div className="gcal-peek-list">
            {(byDate.get(peek.date) || []).map(item => renderChip(item, { allDay: item.allDay }))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScheduleCalendar;
