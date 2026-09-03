import React, { useEffect, useMemo, useState } from 'react';
import { companyService, type CalendarIntegration, type CalendarSyncStats, type Schedule, type ScheduleAuditEntry, type ScheduleInput } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import { CardGridSkeleton } from './Skeletons';
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

const CompanyScheduleView: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]); const [students, setStudents] = useState<Profile[]>([]); const [calendar, setCalendar] = useState<CalendarIntegration | null>(null); const [calendarUnavailable, setCalendarUnavailable] = useState(false); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState<string | null>(null); const [pendingCalendarAuthorizationUrl, setPendingCalendarAuthorizationUrl] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false); const [syncStats, setSyncStats] = useState<CalendarSyncStats | null>(null);
  const [filter, setFilter] = useState<'today'|'week'|'upcoming'|'completed'|'all'>('all'); const [search, setSearch] = useState(''); const [form, setForm] = useState<ScheduleInput>(freshForm()); const [editing, setEditing] = useState<Schedule | null>(null); const [details, setDetails] = useState<Schedule | null>(null); const [history, setHistory] = useState<ScheduleAuditEntry[]>([]); const [studentSearch, setStudentSearch] = useState(''); const [saving, setSaving] = useState(false);
  // The connection status is loaded on its own. Bundling it with students and
  // schedules meant one slow or failing query left the card reading
  // "Not connected" for a company whose calendar was in fact still linked.
  const loadCalendar = async () => {
    try { setCalendar(await companyService.getCalendarIntegration()); setCalendarUnavailable(false); }
    catch (error) { console.error('Unable to read the Google Calendar connection', error); setCalendarUnavailable(true); }
  };
  const load = async () => { setLoading(true); try { const profile = await profileService.getCurrentProfile(); if (!profile?.company_id) throw new Error('You are not associated with a company.'); const [nextStudents, nextSchedules] = await Promise.all([companyService.getAssignedStudents(profile.company_id), companyService.getSchedules(profile.company_id)]); setStudents(nextStudents); setSchedules(nextSchedules); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load schedules.'); } finally { setLoading(false); } await loadCalendar(); };
  useEffect(() => { void load(); }, []);
  const calendarResultReceivedRef = React.useRef(false);
  const refreshCalendarConnection = async (errorReason?: string) => {
    try {
      const integration = await companyService.getCalendarIntegration();
      setCalendar(integration);
      setCalendarUnavailable(false);
      if (integration?.connected && !integration.needs_reconnect) {
        setNotice(`Google Calendar connected${integration.google_account_email ? ` as ${integration.google_account_email}` : ''}.`);
      } else {
        setNotice(errorReason ? `Google Calendar connection failed: ${errorReason}` : 'Google Calendar connection was not saved. Please reconnect and check the server logs.');
      }
    } catch (error) {
      setCalendarUnavailable(true);
      setNotice(error instanceof Error ? error.message : 'Unable to refresh the Google Calendar connection.');
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
  const visible = useMemo(() => schedules.filter(schedule => {
    const needle = search.trim().toLowerCase();
    if (needle) {
      // Search covers the title, assigned students, the dates, and the
      // location/supervisor, so synced Google events are findable too.
      const haystack = [
        schedule.name, schedule.location, schedule.supervisor_name, schedule.notes,
        schedule.start_date, schedule.end_date, schedule.status,
        ...schedule.assigned_students.map(name),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (filter === 'all') return true;
    if (filter === 'completed' || filter === 'upcoming') return schedule.status === filter;
    if (!schedule.start_date) return false;
    // Compare plain YYYY-MM-DD strings: parsing to Date and back is what let a
    // schedule land on the wrong side of a day boundary.
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const endKey = schedule.end_date || schedule.start_date;
    if (filter === 'today') return schedule.start_date <= todayKey && endKey >= todayKey;
    const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
    const weekKey = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
    return endKey >= todayKey && schedule.start_date <= weekKey;
  }), [filter, schedules, search]);
  const closeForm = () => { setEditing(null); setNotice(null); };
  const edit = (schedule: Schedule) => { setEditing(schedule); setForm({ id: schedule.id, name: schedule.name, start_date: schedule.start_date || new Date().toISOString().slice(0, 10), end_date: schedule.end_date, start_time: schedule.start_time || '08:00', end_time: schedule.end_time || '17:00', break_duration_minutes: schedule.break_duration_minutes ?? 0, location: schedule.location, supervisor_name: schedule.supervisor_name, notes: schedule.notes, recurrence: schedule.recurrence || 'custom_weekdays', working_days: schedule.working_days || [], student_ids: schedule.assigned_students.map(student => student.student_id) }); setStudentSearch(''); };
  const toggle = (key: 'student_ids'|'working_days', value: string) => setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value].sort((a,b) => key === 'working_days' ? DAYS.indexOf(a) - DAYS.indexOf(b) : 0) }));
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (!form.student_ids.length) return setNotice('Select at least one assigned student.'); if (form.start_time >= form.end_time) return setNotice('End time must be later than start time.'); if (form.end_date && form.end_date < form.start_date) return setNotice('End date cannot be earlier than start date.'); if (form.recurrence === 'custom_weekdays' && !form.working_days.length) return setNotice('Choose at least one working day.'); setSaving(true); try { await companyService.saveSchedule(form); closeForm(); await load(); setNotice(calendar?.connected ? 'Schedule saved. Calendar synchronization is queued.' : 'Schedule saved successfully.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save schedule.'); } finally { setSaving(false); } };
  const openDetails = async (schedule: Schedule) => { setDetails(schedule); try { setHistory(await companyService.getScheduleHistory(schedule.id)); } catch { setHistory([]); } };
  const remove = async (schedule: Schedule) => { if (!window.confirm(`Delete “${schedule.name}”?`)) return; try { await companyService.deleteSchedule(schedule.id); setDetails(null); await load(); setNotice('Schedule deleted.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to delete schedule.'); } };
  const calendarAction = async (action: 'connect'|'import'|'sync'|'push'|'disconnect', scheduleId?: string) => {
    const popup = action === 'connect' ? window.open('about:blank', `google-calendar-oauth-${Date.now()}`, 'popup=yes,width=520,height=680,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes') : null;
    if (action === 'connect' && !popup) {
      try {
        const result = await companyService.invokeCalendar('connect', scheduleId, true);
        if (!result.authorizationUrl) throw new Error('Google Calendar did not provide an authorization URL.');
        setPendingCalendarAuthorizationUrl(result.authorizationUrl);
        setNotice('Your browser blocked the first popup. Select Continue to Google to open the secure sign-in window.');
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Calendar request failed. Local schedules are unchanged.');
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
      setNotice(result.message || 'Calendar request completed.');
    } catch (error) {
      popup?.close();
      // Never report success when Google refused the request: surface the real
      // reason and re-read the connection so a revoked grant flips the card.
      setNotice(error instanceof Error ? error.message : 'Unable to sync Google Calendar. Please reconnect and try again.');
      if (action !== 'connect') await loadCalendar();
    }
  };
  const syncCalendar = async (scheduleId?: string) => {
    setSyncing(true);
    setSyncStats(null);
    setNotice('Syncing calendar…');
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
    if (!popup) return setNotice('Your browser is still blocking popups. Allow them for this site, then select Continue to Google again.');
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
  return <div className="view-container fade-in schedule-management"><div className="schedule-header"><div><span className="schedule-eyebrow">COMPANY OPERATIONS</span><h2 className="view-title">Schedule Management</h2><p className="view-subtitle">Plan intern shifts, expected hours, and calendar delivery.</p></div><button className="btn-primary schedule-add-button" onClick={() => { setEditing({} as Schedule); setForm(freshForm()); }}><span>+</span> Add Schedule</button></div>
    {notice && <div className="schedule-message" role="status"><span>{notice}</span>{pendingCalendarAuthorizationUrl && <button className="schedule-message-action" onClick={continueCalendarConnection}>Continue to Google</button>}<button onClick={() => { setNotice(null); setPendingCalendarAuthorizationUrl(null); }}>×</button></div>}
    {(() => {
      const connected = Boolean(calendar?.connected);
      const needsReconnect = Boolean(calendar?.needs_reconnect);
      const lastSynced = syncTimestamp(calendar?.last_synced_at);
      const stats = syncStats ?? calendar?.last_sync_stats;
      return <section className={`schedule-calendar-card ${connected && !needsReconnect ? 'is-connected' : ''}`}>
        <div className="calendar-card-info">
          <span className={`calendar-dot ${connected && !needsReconnect ? 'connected' : needsReconnect ? 'warning' : ''}`} />
          <strong>Google Calendar</strong>
          <span className="calendar-card-state">{calendarUnavailable ? 'Status unavailable' : needsReconnect ? 'Reconnection required' : connected ? 'Connected' : 'Not connected'}</span>
          {calendarUnavailable
            ? <p>We could not check the calendar connection. Refresh the page or try again shortly.</p>
            : needsReconnect
              ? <p>Google rejected the stored authorization for {calendar?.google_account_email || 'this account'}. Reconnect to resume synchronization.</p>
              : connected
                ? <>
                    {calendar?.google_account_email && <p className="calendar-card-account">{calendar.google_account_email}</p>}
                    <p>{calendar?.calendar_name || 'Primary calendar'} · {calendar?.calendar_time_zone || 'Asia/Manila'}</p>
                    <p className="calendar-card-synced">{lastSynced ? `Last synced: ${lastSynced}` : 'Not synced yet'}</p>
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
      </section>;
    })()}
    <div className="schedule-toolbar"><div className="schedule-filters">{(['today','week','upcoming','completed','all'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'week' ? 'This Week' : value[0].toUpperCase()+value.slice(1)}</button>)}</div><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search schedules or students…" /></div>
    {loading ? <CardGridSkeleton cards={3} /> : visible.length === 0 ? <div className="schedule-empty"><strong>No schedules found</strong><p>Create a schedule to define intern working hours and attendance expectations.</p></div> : <div className="schedule-list">{visible.map(schedule => <article key={schedule.id} className="schedule-card"><div className="schedule-card-top"><div><h3>{schedule.name}</h3><p>{schedule.start_date || 'No start date'}{schedule.end_date ? ` — ${schedule.end_date}` : ''}</p></div><span className={`schedule-status ${schedule.status}`}>{schedule.status}</span></div><div className="schedule-summary"><strong>{time(schedule.start_time)} – {time(schedule.end_time)}</strong><span>{schedule.recurrence === 'none' ? 'Does not repeat' : schedule.working_days.map(day => day.slice(0,3)).join(' · ')}</span><span>{schedule.location || 'No location'} · Supervisor: {schedule.supervisor_name || 'Not specified'}</span></div><div className="schedule-card-bottom"><span>{schedule.source === 'google' ? 'From Google Calendar' : `${schedule.assigned_students.length} students assigned`}</span><span className={`sync-state ${schedule.calendar_sync_status}`}>{schedule.calendar_sync_status.replace('_',' ')}</span><div><button className="btn-secondary" onClick={() => void openDetails(schedule)}>View</button><button className="btn-secondary" onClick={() => edit(schedule)}>Edit</button>{calendar?.connected && !calendar.needs_reconnect && schedule.source !== 'google' && <button className="btn-secondary" disabled={syncing} onClick={() => void calendarAction('push', schedule.id)}>Sync</button>}</div></div></article>)}</div>}
    {editing && <div className="schedule-modal-backdrop" onMouseDown={closeForm}><form className="schedule-modal" onSubmit={save} onMouseDown={event => event.stopPropagation()}><header><div><h3>{form.id ? 'Edit Schedule' : 'Add Schedule'}</h3><p>Only interns assigned to your company can be selected.</p></div><button type="button" onClick={closeForm}>×</button></header><div className="schedule-form-grid"><label className="wide">Schedule name<input required value={form.name} onChange={event => setForm({...form,name:event.target.value})} placeholder="OJT Morning Shift" /></label><label>Start date<input required type="date" value={form.start_date} onChange={event => setForm({...form,start_date:event.target.value})} /></label><label>End date<input type="date" value={form.end_date || ''} onChange={event => setForm({...form,end_date:event.target.value || null})} /></label><label>Start time<input required type="time" value={form.start_time} onChange={event => setForm({...form,start_time:event.target.value})} /></label><label>End time<input required type="time" value={form.end_time} onChange={event => setForm({...form,end_time:event.target.value})} /></label><label>Break duration (minutes)<input required type="number" min="0" max="480" value={form.break_duration_minutes} onChange={event => setForm({...form,break_duration_minutes:Number(event.target.value)})} /></label><label>Recurrence<select value={form.recurrence} onChange={event => setForm({...form,recurrence:event.target.value as ScheduleInput['recurrence']})}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom_weekdays">Custom weekdays</option></select></label><label>Location<input value={form.location || ''} onChange={event => setForm({...form,location:event.target.value})} /></label><label>Supervisor<input value={form.supervisor_name || ''} onChange={event => setForm({...form,supervisor_name:event.target.value})} /></label><div className="wide"><span className="field-label">Working days</span><div className="day-picker">{DAYS.map(day => <button type="button" key={day} disabled={form.recurrence === 'none' || form.recurrence === 'daily'} className={form.working_days.includes(day) ? 'selected' : ''} onClick={() => toggle('working_days',day)}>{day.slice(0,3)}</button>)}</div></div><label className="wide">Notes<textarea value={form.notes || ''} onChange={event => setForm({...form,notes:event.target.value})} /></label></div><section className="student-picker"><div><strong>Assigned students</strong><span>{form.student_ids.length} selected</span></div><input value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Search assigned students…" /><div className="student-options">{matches.map(student => <label key={student.auth_user_id}><input type="checkbox" checked={form.student_ids.includes(student.auth_user_id)} onChange={() => toggle('student_ids',student.auth_user_id)} /><span><strong>{name(student)}</strong><small>{[student.course,student.department].filter(Boolean).join(' · ') || student.email}</small></span></label>)}</div></section><footer><button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Schedule'}</button></footer></form></div>}
    {details && <div className="schedule-modal-backdrop" onMouseDown={() => setDetails(null)}><section className="schedule-modal schedule-details" onMouseDown={event => event.stopPropagation()}><header><div><h3>{details.name}</h3><p>{time(details.start_time)} – {time(details.end_time)} · {details.break_duration_minutes} minute break</p></div><button onClick={() => setDetails(null)}>×</button></header><div className="details-section"><strong>Assigned students</strong>{details.assigned_students.map(student => <div key={student.student_id}>{name(student)} <small>{[student.course,student.department].filter(Boolean).join(' · ')}</small></div>)}</div><div className="details-section"><strong>Notes</strong><p>{details.notes || 'No notes provided.'}</p></div><div className="details-section"><strong>Schedule history</strong>{history.length ? history.map(item => <div key={item.id}><b>{item.action.replaceAll('_',' ')}</b><small>{item.actor_name || 'Company user'} · {new Date(item.created_at).toLocaleString()}</small></div>) : <p>No history available yet.</p>}</div><footer><button className="btn-secondary" onClick={() => edit(details)}>Edit</button><button className="schedule-delete" onClick={() => void remove(details)}>Delete Schedule</button></footer></section></div>}
  </div>;
};
export default CompanyScheduleView;
