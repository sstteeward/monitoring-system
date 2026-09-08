import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { companyService, type CalendarIntegration, type CalendarSyncStats, type Schedule, type ScheduleAuditEntry, type ScheduleInput } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import ScheduleCalendar, { type CalendarDraft, type CalendarMove } from './ScheduleCalendar';
import { MONTH_SHORT, colorIndex, isAllDay, minutesFromTime, parseKey } from '../utils/scheduleCalendar';
import './CompanyScheduleView.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const syncTimestamp = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.toLocaleDateString(undefined, { dateStyle: 'long' })} · ${parsed.toLocaleTimeString(undefined, { timeStyle: 'short' })}`;
};
const syncCounts = (stats: CalendarSyncStats | null | undefined) => {
  if (!stats) return [];
  return [
    ['events retrieved', stats.retrieved],
    ['schedules created', stats.created],
    ['schedules updated', stats.updated],
    ['removed', stats.removed],
    ['pushed to Google', stats.pushed],
  ].filter(([, count]) => typeof count === 'number') as [string, number][];
};
const freshForm = (): ScheduleInput => ({ name: '', start_date: new Date().toISOString().slice(0, 10), end_date: null, start_time: '08:00', end_time: '17:00', break_duration_minutes: 60, location: '', supervisor_name: '', notes: '', recurrence: 'custom_weekdays', working_days: DAYS.slice(0, 5), student_ids: [] });
const time = (value: string | null) => { if (!value) return '—'; const [hour, minute] = value.split(':').map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`; };
const name = (student: { first_name: string | null; last_name: string | null }) => [student.first_name, student.last_name].filter(Boolean).join(' ') || 'Unnamed student';
const longDate = (value: string | null) => {
  if (!value) return '—';
  const parsed = parseKey(value);
  return `${MONTH_SHORT[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
};
const stamp = (value: string | null | undefined) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString();
};
const recurrenceLabel = (schedule: Schedule) => {
  if (schedule.recurrence === 'none') return 'Does not repeat';
  if (schedule.recurrence === 'daily') return 'Repeats daily';
  const days = schedule.working_days?.length ? schedule.working_days.map(day => day.slice(0, 3)).join(', ') : 'no days selected';
  return `Repeats weekly · ${days}`;
};
const syncStateLabel = (schedule: Schedule) => {
  if (schedule.source === 'google') return 'Imported from Google Calendar';
  switch (schedule.calendar_sync_status) {
    case 'synced': return 'Synced to Google Calendar';
    case 'pending': return 'Queued for the next synchronization';
    case 'failed': return 'Last synchronization failed';
    default: return 'Not connected to Google Calendar';
  }
};

const CompanyScheduleView: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]); const [students, setStudents] = useState<Profile[]>([]); const [calendar, setCalendar] = useState<CalendarIntegration | null>(null); const [calendarUnavailable, setCalendarUnavailable] = useState(false); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'error' } | null>(null); const [pendingCalendarAuthorizationUrl, setPendingCalendarAuthorizationUrl] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false); const [syncStats, setSyncStats] = useState<CalendarSyncStats | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null); const [search, setSearch] = useState(''); const [form, setForm] = useState<ScheduleInput>(freshForm()); const [editing, setEditing] = useState<Schedule | null>(null); const [details, setDetails] = useState<{ schedule: Schedule; date: string } | null>(null); const [history, setHistory] = useState<ScheduleAuditEntry[]>([]); const [studentSearch, setStudentSearch] = useState(''); const [saving, setSaving] = useState(false);
  const notify = useCallback((text: string | null, tone: 'info' | 'error' = 'info') => setNotice(text ? { text, tone } : null), []);
  // The connection status is loaded on its own. Bundling it with students and
  // schedules meant one slow or failing query left the card reading
  // "Not connected" for a company whose calendar was in fact still linked.
  const loadCalendar = async () => {
    try { setCalendar(await companyService.getCalendarIntegration()); setCalendarUnavailable(false); }
    catch (error) { console.error('Unable to read the Google Calendar connection', error); setCalendarUnavailable(true); }
  };
  const load = async () => { setLoading(true); try { const profile = await profileService.getCurrentProfile(); if (!profile?.company_id) throw new Error('You are not associated with a company.'); setCompanyId(profile.company_id); const [nextStudents, nextSchedules] = await Promise.all([companyService.getAssignedStudents(profile.company_id), companyService.getSchedules(profile.company_id)]); setStudents(nextStudents); setSchedules(nextSchedules); } catch (error) { notify(error instanceof Error ? error.message : 'Unable to load schedules.', 'error'); } finally { setLoading(false); } await loadCalendar(); };
  // Re-read the schedules without the loading skeleton, so a drag or a save
  // does not blank the grid the user is looking at.
  const refreshSchedules = async () => {
    const id = companyId ?? (await profileService.getCurrentProfile())?.company_id;
    if (!id) return;
    setCompanyId(id);
    setSchedules(await companyService.getSchedules(id));
  };
  useEffect(() => { void load(); }, []);
  const calendarResultReceivedRef = React.useRef(false);
  const refreshCalendarConnection = async (errorReason?: string) => {
    try {
      const integration = await companyService.getCalendarIntegration();
      setCalendar(integration);
      setCalendarUnavailable(false);
      if (integration?.connected && !integration.needs_reconnect) {
        notify(`Google Calendar connected${integration.google_account_email ? ` as ${integration.google_account_email}` : ''}.`);
      } else {
        notify(errorReason ? `Google Calendar connection failed: ${errorReason}` : 'Google Calendar connection was not saved. Please reconnect and check the server logs.', 'error');
      }
    } catch (error) {
      setCalendarUnavailable(true);
      notify(error instanceof Error ? error.message : 'Unable to refresh the Google Calendar connection.', 'error');
    }
  };
  useEffect(() => {
    const receiveCalendarResult = (event: MessageEvent) => {
      const allowedOrigins = [window.location.origin, 'https://asiancollegesilmonitoringsystem.vercel.app'];
      if (!allowedOrigins.includes(event.origin)) return;
      if (event.data?.type === 'google-calendar-connected') {
        calendarResultReceivedRef.current = true;
        void refreshCalendarConnection();
      }
      if (event.data?.type === 'google-calendar-error') {
        calendarResultReceivedRef.current = true;
        void refreshCalendarConnection(event.data?.reason);
      }
    };
    window.addEventListener('message', receiveCalendarResult);
    return () => window.removeEventListener('message', receiveCalendarResult);
  }, []);
  const closeForm = () => { setEditing(null); notify(null); };
  const openCreate = (draft?: CalendarDraft) => {
    setDetails(null);
    setEditing({} as Schedule);
    // A slot that was clicked is a one-off at that exact time; the toolbar
    // button keeps the weekday-pattern default the form has always had.
    setForm(draft
      ? { ...freshForm(), start_date: draft.date, start_time: draft.start_time, end_time: draft.end_time, recurrence: 'none', working_days: [] }
      : freshForm());
    setStudentSearch('');
  };
  const edit = (schedule: Schedule) => { setDetails(null); setEditing(schedule); setForm({ id: schedule.id, name: schedule.name, start_date: schedule.start_date || new Date().toISOString().slice(0, 10), end_date: schedule.end_date, start_time: schedule.start_time || '08:00', end_time: schedule.end_time || '17:00', break_duration_minutes: schedule.break_duration_minutes ?? 0, location: schedule.location, supervisor_name: schedule.supervisor_name, notes: schedule.notes, recurrence: schedule.recurrence || 'custom_weekdays', working_days: schedule.working_days || [], student_ids: schedule.assigned_students.map(student => student.student_id) }); setStudentSearch(''); };
  const toggle = (key: 'student_ids'|'working_days', value: string) => setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value].sort((a,b) => key === 'working_days' ? DAYS.indexOf(a) - DAYS.indexOf(b) : 0) }));
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (!form.student_ids.length) return notify('Select at least one assigned student.', 'error'); if (form.start_time >= form.end_time) return notify('End time must be later than start time.', 'error'); if (form.end_date && form.end_date < form.start_date) return notify('End date cannot be earlier than start date.', 'error'); if (form.recurrence === 'custom_weekdays' && !form.working_days.length) return notify('Choose at least one working day.', 'error'); setSaving(true); try { await companyService.saveSchedule(form); closeForm(); await load(); notify(calendar?.connected ? 'Schedule saved. Calendar synchronization is queued.' : 'Schedule saved successfully.'); } catch (error) { notify(error instanceof Error ? error.message : 'Unable to save schedule.', 'error'); } finally { setSaving(false); } };
  const openDetails = async (schedule: Schedule, date: string) => { setDetails({ schedule, date }); setHistory([]); try { setHistory(await companyService.getScheduleHistory(schedule.id)); } catch { setHistory([]); } };
  const remove = async (schedule: Schedule) => { if (!window.confirm(`Delete “${schedule.name}”?`)) return; try { await companyService.deleteSchedule(schedule.id); setDetails(null); await load(); notify('Schedule deleted.'); } catch (error) { notify(error instanceof Error ? error.message : 'Unable to delete schedule.', 'error'); } };

  /**
   * Why a schedule cannot be dragged. The save RPC rewrites the whole row, so
   * anything it would refuse — a Google-owned event, a row with no students —
   * must not be draggable at all, and a repeating schedule cannot change day
   * without changing the working days it repeats on.
   */
  const dragBlockedReason = useCallback((schedule: Schedule, dayDelta: number) => {
    if (schedule.source === 'google') return 'Events imported from Google Calendar are edited in Google Calendar.';
    if (!schedule.assigned_students.length) return 'Assign at least one student to this schedule before rescheduling it.';
    if (schedule.status === 'cancelled') return 'Cancelled schedules cannot be rescheduled.';
    if (dayDelta !== 0 && schedule.recurrence !== 'none') return 'This schedule repeats — open it to change the days it runs on.';
    return null;
  }, []);

  const moveSchedule = async (schedule: Schedule, next: CalendarMove) => {
    const blocked = dragBlockedReason(schedule, next.start_date === schedule.start_date ? 0 : 1);
    if (blocked) return notify(blocked, 'error');
    const previous = schedules;
    // Move it on screen first; the row is written straight afterwards and put
    // back if the database refuses (a student conflict, most often).
    setSchedules(current => current.map(item => item.id === schedule.id ? { ...item, ...next } : item));
    try {
      await companyService.saveSchedule({
        id: schedule.id, name: schedule.name,
        start_date: next.start_date, end_date: next.end_date,
        start_time: next.start_time, end_time: next.end_time,
        break_duration_minutes: schedule.break_duration_minutes ?? 0,
        location: schedule.location, supervisor_name: schedule.supervisor_name, notes: schedule.notes,
        recurrence: schedule.recurrence, working_days: schedule.working_days || [],
        student_ids: schedule.assigned_students.map(student => student.student_id),
      });
      await refreshSchedules();
      const moved = `“${schedule.name}” moved to ${longDate(next.start_date)}, ${time(next.start_time)} – ${time(next.end_time)}.`;
      notify(calendar?.connected && !calendar.needs_reconnect ? `${moved} Calendar synchronization is queued.` : moved);
    } catch (error) {
      setSchedules(previous);
      notify(error instanceof Error ? error.message : 'Unable to move this schedule.', 'error');
    }
  };

  const calendarAction = async (action: 'connect'|'import'|'sync'|'push'|'disconnect', scheduleId?: string) => {
    const popup = action === 'connect' ? window.open('about:blank', `google-calendar-oauth-${Date.now()}`, 'popup=yes,width=520,height=680,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes') : null;
    if (action === 'connect' && !popup) {
      try {
        const result = await companyService.invokeCalendar('connect', scheduleId, true);
        if (!result.authorizationUrl) throw new Error('Google Calendar did not provide an authorization URL.');
        setPendingCalendarAuthorizationUrl(result.authorizationUrl);
        notify('Your browser blocked the first popup. Select Continue to Google to open the secure sign-in window.', 'error');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Calendar request failed. Local schedules are unchanged.', 'error');
      }
      return;
    }
    if (popup) {
      popup.document.title = 'Connecting Google Calendar…';
      popup.document.body.innerHTML = '<p style="font:15px system-ui,sans-serif;padding:24px">Opening Google account selection…</p>';
      popup.focus();
    }
    try {
      calendarResultReceivedRef.current = false;
      const result = await companyService.invokeCalendar(action, scheduleId, Boolean(popup));
      if (result.authorizationUrl) {
        popup!.location.replace(result.authorizationUrl);
        const watchPopup = window.setInterval(() => {
          if (!popup!.closed) return;
          window.clearInterval(watchPopup);
          if (!calendarResultReceivedRef.current) {
            void refreshCalendarConnection();
          }
        }, 500);
        return;
      }
      await load();
      if (result.stats) setSyncStats(result.stats);
      notify(result.message || 'Calendar request completed.');
    } catch (error) {
      popup?.close();
      // Never report success when Google refused the request: surface the real
      // reason and re-read the connection so a revoked grant flips the card.
      notify(error instanceof Error ? error.message : 'Unable to sync Google Calendar. Please reconnect and try again.', 'error');
      if (action !== 'connect') await loadCalendar();
    }
  };
  const syncCalendar = async (scheduleId?: string) => {
    setSyncing(true);
    setSyncStats(null);
    notify('Syncing calendar…');
    try { await calendarAction('sync', scheduleId); } finally { setSyncing(false); }
  };
  const disconnectCalendar = async () => {
    if (!window.confirm('Disconnect Google Calendar? Your SIL schedules and your Google Calendar events are both kept — only the link between them is removed.')) return;
    setSyncStats(null);
    await calendarAction('disconnect');
  };
  const continueCalendarConnection = () => {
    if (!pendingCalendarAuthorizationUrl) return;
    const popup = window.open('about:blank', `google-calendar-oauth-${Date.now()}`, 'popup=yes,width=520,height=680,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes');
    if (!popup) return notify('Your browser is still blocking popups. Allow them for this site, then select Continue to Google again.', 'error');
    calendarResultReceivedRef.current = false;
    setPendingCalendarAuthorizationUrl(null);
    popup.location.replace(pendingCalendarAuthorizationUrl);
    const watchPopup = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(watchPopup);
      if (!calendarResultReceivedRef.current) {
        void refreshCalendarConnection();
      }
    }, 500);
  };
  const matches = students.filter(student => `${name(student)} ${student.course || ''} ${student.department || ''}`.toLowerCase().includes(studentSearch.toLowerCase()));

  const connected = Boolean(calendar?.connected);
  const needsReconnect = Boolean(calendar?.needs_reconnect);
  const integrationChip = useMemo(() => {
    if (calendarUnavailable) return { label: 'Calendar status unavailable', tone: 'warning' as const };
    if (needsReconnect) return { label: 'Reconnect Google Calendar', tone: 'warning' as const };
    if (connected) return { label: calendar?.google_account_email || 'Google Calendar connected', tone: 'connected' as const };
    return { label: 'Connect Google Calendar', tone: 'idle' as const };
  }, [calendarUnavailable, needsReconnect, connected, calendar?.google_account_email]);

  const lastSynced = syncTimestamp(calendar?.last_synced_at);
  const stats = syncStats ?? calendar?.last_sync_stats;
  const integrationPanel = (
    <section className={`schedule-calendar-card ${connected && !needsReconnect ? 'is-connected' : ''}`}>
      {/* Two tight lines rather than a stack of paragraphs: the same account,
          calendar, timezone, sync time and run counts, in about half the height. */}
      <div className="calendar-card-info">
        <div className="calendar-card-line">
          <span className={`calendar-dot ${connected && !needsReconnect ? 'connected' : needsReconnect ? 'warning' : ''}`} />
          <strong>Google Calendar</strong>
          <span className="calendar-card-state">{calendarUnavailable ? 'Status unavailable' : needsReconnect ? 'Reconnection required' : connected ? 'Connected' : 'Not connected'}</span>
        </div>
        {calendarUnavailable
          ? <p>We could not check the calendar connection. Refresh the page or try again shortly.</p>
          : needsReconnect
            ? <p>Google rejected the stored authorization for {calendar?.google_account_email || 'this account'}. Reconnect to resume synchronization.</p>
            : connected
              ? <>
                  <p className="calendar-card-meta">
                    {calendar?.google_account_email && <b>{calendar.google_account_email}</b>}
                    <span>{calendar?.calendar_name || 'Primary calendar'} · {calendar?.calendar_time_zone || 'Asia/Manila'}</span>
                    <span>{lastSynced ? `Last synced: ${lastSynced}` : 'Not synced yet'}</span>
                  </p>
                  {stats && syncCounts(stats).length > 0 && <ul className="calendar-card-stats">{syncCounts(stats).map(([label, count]) => <li key={label}><b>{count}</b> {label}</li>)}</ul>}
                </>
              : <p>Connect your company calendar to synchronize schedules. Local scheduling always remains available.</p>}
      </div>
      <div className="calendar-card-actions">
        {connected && !needsReconnect
          ? <>
              <button className="btn-primary" disabled={syncing} onClick={() => void syncCalendar()}>{syncing ? 'Syncing…' : 'Sync Calendar'}</button>
              <button className="btn-secondary" disabled={syncing} onClick={() => void disconnectCalendar()}>Disconnect</button>
            </>
          : <button className="btn-primary" onClick={() => void calendarAction('connect')}>{connected || needsReconnect ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}</button>}
      </div>
    </section>
  );

  const detailSchedule = details?.schedule;

  return <div className="view-container fade-in schedule-management">
    <div className="schedule-header">
      <div>
        <span className="schedule-eyebrow">COMPANY OPERATIONS</span>
        <h2 className="view-title">Schedule Management</h2>
      </div>
    </div>
    {notice && <div className={`schedule-message ${notice.tone === 'error' ? 'is-error' : ''}`} role="status"><span>{notice.text}</span>{pendingCalendarAuthorizationUrl && <button className="schedule-message-action" onClick={continueCalendarConnection}>Continue to Google</button>}<button aria-label="Dismiss" onClick={() => { notify(null); setPendingCalendarAuthorizationUrl(null); }}>×</button></div>}

    <ScheduleCalendar
      schedules={schedules}
      loading={loading}
      search={search}
      onSearchChange={setSearch}
      onCreate={openCreate}
      onSelect={(schedule, date) => void openDetails(schedule, date)}
      onMove={moveSchedule}
      dragBlockedReason={dragBlockedReason}
      shortcutsEnabled={!editing && !details}
      integrationChip={integrationChip}
      integrationPanel={integrationPanel}
      addButton={<button className="btn-primary schedule-add-button" onClick={() => openCreate()}><span>+</span> Add Schedule</button>}
    />

    {editing && <div className="schedule-modal-backdrop" onMouseDown={closeForm}><form className="schedule-modal" onSubmit={save} onMouseDown={event => event.stopPropagation()}><header><div><h3>{form.id ? 'Edit Schedule' : 'Add Schedule'}</h3><p>Only interns assigned to your company can be selected.</p></div><button type="button" onClick={closeForm}>×</button></header><div className="schedule-form-grid"><label className="wide">Schedule name<input required value={form.name} onChange={event => setForm({...form,name:event.target.value})} placeholder="OJT Morning Shift" /></label><label>Start date<input required type="date" value={form.start_date} onChange={event => setForm({...form,start_date:event.target.value})} /></label><label>End date<input type="date" value={form.end_date || ''} onChange={event => setForm({...form,end_date:event.target.value || null})} /></label><label>Start time<input required type="time" value={form.start_time} onChange={event => setForm({...form,start_time:event.target.value})} /></label><label>End time<input required type="time" value={form.end_time} onChange={event => setForm({...form,end_time:event.target.value})} /></label><label>Break duration (minutes)<input required type="number" min="0" max="480" value={form.break_duration_minutes} onChange={event => setForm({...form,break_duration_minutes:Number(event.target.value)})} /></label><label>Recurrence<select value={form.recurrence} onChange={event => setForm({...form,recurrence:event.target.value as ScheduleInput['recurrence']})}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom_weekdays">Custom weekdays</option></select></label><label>Location<input value={form.location || ''} onChange={event => setForm({...form,location:event.target.value})} /></label><label>Supervisor<input value={form.supervisor_name || ''} onChange={event => setForm({...form,supervisor_name:event.target.value})} /></label><div className="wide"><span className="field-label">Working days</span><div className="day-picker">{DAYS.map(day => <button type="button" key={day} disabled={form.recurrence === 'none' || form.recurrence === 'daily'} className={form.working_days.includes(day) ? 'selected' : ''} onClick={() => toggle('working_days',day)}>{day.slice(0,3)}</button>)}</div></div><label className="wide">Notes<textarea value={form.notes || ''} onChange={event => setForm({...form,notes:event.target.value})} /></label></div><section className="student-picker"><div><strong>Assigned students</strong><span>{form.student_ids.length} selected</span></div><input value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Search assigned students…" /><div className="student-options">{matches.map(student => <label key={student.auth_user_id}><input type="checkbox" checked={form.student_ids.includes(student.auth_user_id)} onChange={() => toggle('student_ids',student.auth_user_id)} /><span><strong>{name(student)}</strong><small>{[student.course,student.department].filter(Boolean).join(' · ') || student.email}</small></span></label>)}</div></section><footer><button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Schedule'}</button></footer></form></div>}

    {details && detailSchedule && <div className="schedule-modal-backdrop" onMouseDown={() => setDetails(null)}>
      <section className="schedule-modal schedule-details" onMouseDown={event => event.stopPropagation()}>
        <header>
          <div className="details-heading">
            <span className={`details-swatch gcal-c${colorIndex(detailSchedule.id)}`} />
            <div>
              <h3>{detailSchedule.name}</h3>
              <p>{longDate(details.date)} · {isAllDay(detailSchedule) ? 'All day' : `${time(detailSchedule.start_time)} – ${time(detailSchedule.end_time)}`}</p>
            </div>
          </div>
          <button aria-label="Close" onClick={() => setDetails(null)}>×</button>
        </header>
        <div className="details-badges">
          <span className={`schedule-status ${detailSchedule.status}`}>{detailSchedule.status}</span>
          <span className={`sync-state ${detailSchedule.calendar_sync_status}`}>{detailSchedule.calendar_sync_status.replace('_', ' ')}</span>
          {detailSchedule.source === 'google' && <span className="sync-state source-google">Google Calendar</span>}
        </div>
        <dl className="details-grid">
          <div><dt>Date range</dt><dd>{longDate(detailSchedule.start_date)}{detailSchedule.end_date ? ` – ${longDate(detailSchedule.end_date)}` : ''}</dd></div>
          <div><dt>Start time</dt><dd>{time(detailSchedule.start_time)}</dd></div>
          <div><dt>End time</dt><dd>{time(detailSchedule.end_time)}</dd></div>
          <div><dt>Duration</dt><dd>{(() => { const span = minutesFromTime(detailSchedule.end_time, 0) - minutesFromTime(detailSchedule.start_time, 0); const worked = Math.max(0, span - (detailSchedule.break_duration_minutes ?? 0)); return `${Math.floor(worked / 60)}h ${worked % 60}m worked · ${detailSchedule.break_duration_minutes ?? 0} min break`; })()}</dd></div>
          <div><dt>Recurrence</dt><dd>{recurrenceLabel(detailSchedule)}</dd></div>
          <div><dt>Location</dt><dd>{detailSchedule.location || 'Not specified'}</dd></div>
          <div><dt>Supervisor</dt><dd>{detailSchedule.supervisor_name || 'Not specified'}</dd></div>
          <div><dt>Google Calendar</dt><dd>{syncStateLabel(detailSchedule)}</dd></div>
          <div><dt>Created</dt><dd>{stamp(detailSchedule.created_at)}</dd></div>
          <div><dt>Last updated</dt><dd>{stamp(detailSchedule.updated_at)}</dd></div>
        </dl>
        <div className="details-section">
          <strong>Assigned students</strong>
          {detailSchedule.assigned_students.length
            ? detailSchedule.assigned_students.map(student => <div key={student.student_id}>{name(student)} <small>{[student.course, student.department].filter(Boolean).join(' · ')}</small></div>)
            : <p>No students assigned{detailSchedule.source === 'google' ? ' — this event came from Google Calendar.' : '.'}</p>}
        </div>
        <div className="details-section"><strong>Description</strong><p>{detailSchedule.notes || 'No notes provided.'}</p></div>
        <div className="details-section"><strong>Schedule history</strong>{history.length ? history.map(item => <div key={item.id}><b>{item.action.replaceAll('_',' ')}</b><small>{item.actor_name || 'Company user'} · {new Date(item.created_at).toLocaleString()}</small></div>) : <p>No history available yet.</p>}</div>
        <footer>
          {connected && !needsReconnect && detailSchedule.source !== 'google' && <button className="btn-secondary" disabled={syncing} onClick={() => void calendarAction('push', detailSchedule.id)}>Sync to Google Calendar</button>}
          <button className="btn-secondary" onClick={() => edit(detailSchedule)}>Edit</button>
          <button className="schedule-delete" onClick={() => void remove(detailSchedule)}>Delete Schedule</button>
        </footer>
      </section>
    </div>}
  </div>;
};
export default CompanyScheduleView;
