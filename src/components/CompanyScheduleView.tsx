import React, { useEffect, useMemo, useState } from 'react';
import { companyService, type CalendarIntegration, type Schedule, type ScheduleAuditEntry, type ScheduleInput } from '../services/companyService';
import { profileService, type Profile } from '../services/profileService';
import { CardGridSkeleton } from './Skeletons';
import './CompanyScheduleView.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const freshForm = (): ScheduleInput => ({ name: '', start_date: new Date().toISOString().slice(0, 10), end_date: null, start_time: '08:00', end_time: '17:00', break_duration_minutes: 60, location: '', supervisor_name: '', notes: '', recurrence: 'custom_weekdays', working_days: DAYS.slice(0, 5), student_ids: [] });
const time = (value: string | null) => { if (!value) return '—'; const [hour, minute] = value.split(':').map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`; };
const name = (student: { first_name: string | null; last_name: string | null }) => [student.first_name, student.last_name].filter(Boolean).join(' ') || 'Unnamed student';

const CompanyScheduleView: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]); const [students, setStudents] = useState<Profile[]>([]); const [calendar, setCalendar] = useState<CalendarIntegration | null>(null); const [loading, setLoading] = useState(true); const [notice, setNotice] = useState<string | null>(null); const [pendingCalendarAuthorizationUrl, setPendingCalendarAuthorizationUrl] = useState<string | null>(null);
  const [filter, setFilter] = useState<'today'|'week'|'upcoming'|'completed'|'all'>('all'); const [search, setSearch] = useState(''); const [form, setForm] = useState<ScheduleInput>(freshForm()); const [editing, setEditing] = useState<Schedule | null>(null); const [details, setDetails] = useState<Schedule | null>(null); const [history, setHistory] = useState<ScheduleAuditEntry[]>([]); const [studentSearch, setStudentSearch] = useState(''); const [saving, setSaving] = useState(false);
  const load = async () => { setLoading(true); try { const profile = await profileService.getCurrentProfile(); if (!profile?.company_id) throw new Error('You are not associated with a company.'); const [nextStudents, nextSchedules, nextCalendar] = await Promise.all([companyService.getAssignedStudents(profile.company_id), companyService.getSchedules(profile.company_id), companyService.getCalendarIntegration()]); setStudents(nextStudents); setSchedules(nextSchedules); setCalendar(nextCalendar); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to load schedules.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const refreshCalendarConnection = async (errorReason?: string) => {
    try {
      const integration = await companyService.getCalendarIntegration();
      setCalendar(integration);
      if (integration?.connected) {
        setNotice('Google Calendar connected.');
      } else {
        setNotice(errorReason ? `Google Calendar connection failed: ${errorReason}` : 'Google Calendar connection was not saved. Please reconnect and check the server logs.');
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to refresh the Google Calendar connection.');
    }
  };
  useEffect(() => {
    const receiveCalendarResult = (event: MessageEvent) => {
      const allowedOrigins = [window.location.origin, 'https://asiancollegesilmonitoringsystem.vercel.app'];
      if (!allowedOrigins.includes(event.origin)) return;
      if (event.data?.type === 'google-calendar-connected') void refreshCalendarConnection();
      if (event.data?.type === 'google-calendar-error') void refreshCalendarConnection(event.data?.reason);
    };
    window.addEventListener('message', receiveCalendarResult);
    return () => window.removeEventListener('message', receiveCalendarResult);
  }, []);
  const visible = useMemo(() => schedules.filter(schedule => { const needle = search.toLowerCase(); if (needle && !schedule.name.toLowerCase().includes(needle) && !schedule.assigned_students.some(student => name(student).toLowerCase().includes(needle))) return false; if (filter === 'all') return true; if (filter === 'completed' || filter === 'upcoming') return schedule.status === filter; const start = schedule.start_date ? new Date(`${schedule.start_date}T00:00:00`) : null; const today = new Date(); today.setHours(0,0,0,0); if (filter === 'today') return start?.toDateString() === today.toDateString(); const week = new Date(today); week.setDate(today.getDate() + 7); return !!start && start >= today && start <= week; }), [filter, schedules, search]);
  const closeForm = () => { setEditing(null); setNotice(null); };
  const edit = (schedule: Schedule) => { setEditing(schedule); setForm({ id: schedule.id, name: schedule.name, start_date: schedule.start_date || new Date().toISOString().slice(0, 10), end_date: schedule.end_date, start_time: schedule.start_time || '08:00', end_time: schedule.end_time || '17:00', break_duration_minutes: schedule.break_duration_minutes ?? 0, location: schedule.location, supervisor_name: schedule.supervisor_name, notes: schedule.notes, recurrence: schedule.recurrence || 'custom_weekdays', working_days: schedule.working_days || [], student_ids: schedule.assigned_students.map(student => student.student_id) }); setStudentSearch(''); };
  const toggle = (key: 'student_ids'|'working_days', value: string) => setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value].sort((a,b) => key === 'working_days' ? DAYS.indexOf(a) - DAYS.indexOf(b) : 0) }));
  const save = async (event: React.FormEvent) => { event.preventDefault(); if (!form.student_ids.length) return setNotice('Select at least one assigned student.'); if (form.start_time >= form.end_time) return setNotice('End time must be later than start time.'); if (form.end_date && form.end_date < form.start_date) return setNotice('End date cannot be earlier than start date.'); if (form.recurrence === 'custom_weekdays' && !form.working_days.length) return setNotice('Choose at least one working day.'); setSaving(true); try { await companyService.saveSchedule(form); closeForm(); await load(); setNotice(calendar?.connected ? 'Schedule saved. Calendar synchronization is queued.' : 'Schedule saved successfully.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to save schedule.'); } finally { setSaving(false); } };
  const openDetails = async (schedule: Schedule) => { setDetails(schedule); try { setHistory(await companyService.getScheduleHistory(schedule.id)); } catch { setHistory([]); } };
  const remove = async (schedule: Schedule) => { if (!window.confirm(`Delete “${schedule.name}”?`)) return; try { await companyService.deleteSchedule(schedule.id); setDetails(null); await load(); setNotice('Schedule deleted.'); } catch (error) { setNotice(error instanceof Error ? error.message : 'Unable to delete schedule.'); } };
  const calendarAction = async (action: 'connect'|'sync'|'disconnect', scheduleId?: string) => {
    // Use a new, script-created window each time. Reusing a previously opened
    // named tab can make the browser refuse the completion page's close call.
    const popup = action === 'connect' ? window.open('about:blank', `google-calendar-oauth-${Date.now()}`, 'popup=yes,width=520,height=680,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes') : null;
    if (action === 'connect' && !popup) {
      try {
        // This URL is opened only after the user selects the fallback action,
        // so that action is a fresh browser-recognized user gesture.
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
      const result = await companyService.invokeCalendar(action, scheduleId, Boolean(popup));
      if (result.authorizationUrl) {
        popup!.location.replace(result.authorizationUrl);
        const watchPopup = window.setInterval(() => {
          if (!popup!.closed) return;
          window.clearInterval(watchPopup);
          void refreshCalendarConnection();
        }, 500);
        return;
      }
      await load(); setNotice(result.message || 'Calendar request completed.');
    } catch (error) {
      popup?.close();
      setNotice(error instanceof Error ? error.message : 'Calendar request failed. Local schedules are unchanged.');
    }
  };
  const continueCalendarConnection = () => {
    if (!pendingCalendarAuthorizationUrl) return;
    const popup = window.open('about:blank', `google-calendar-oauth-${Date.now()}`, 'popup=yes,width=520,height=680,menubar=no,toolbar=no,status=no,resizable=yes,scrollbars=yes');
    if (!popup) return setNotice('Your browser is still blocking popups. Allow them for this site, then select Continue to Google again.');
    setPendingCalendarAuthorizationUrl(null);
    popup.location.replace(pendingCalendarAuthorizationUrl);
    const watchPopup = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(watchPopup);
      void refreshCalendarConnection();
    }, 500);
  };
  const matches = students.filter(student => `${name(student)} ${student.course || ''} ${student.department || ''}`.toLowerCase().includes(studentSearch.toLowerCase()));
  return <div className="view-container fade-in schedule-management"><div className="schedule-header"><div><span className="schedule-eyebrow">COMPANY OPERATIONS</span><h2 className="view-title">Schedule Management</h2><p className="view-subtitle">Plan intern shifts, expected hours, and calendar delivery.</p></div><button className="btn-primary schedule-add-button" onClick={() => { setEditing({} as Schedule); setForm(freshForm()); }}><span>+</span> Add Schedule</button></div>
    {notice && <div className="schedule-message" role="status"><span>{notice}</span>{pendingCalendarAuthorizationUrl && <button className="schedule-message-action" onClick={continueCalendarConnection}>Continue to Google</button>}<button onClick={() => { setNotice(null); setPendingCalendarAuthorizationUrl(null); }}>×</button></div>}
    <section className="schedule-calendar-card"><div><span className={`calendar-dot ${calendar?.connected ? 'connected' : ''}`} /><strong>Google Calendar {calendar?.connected ? 'Connected' : 'Integration'}</strong><p>{calendar?.connected ? `${calendar.calendar_name || 'Selected calendar'} · ${calendar.automatic_sync ? 'Automatic sync on' : 'Manual sync'}` : 'Connect your company calendar to send schedules externally. Local scheduling always remains available.'}</p></div><div>{calendar?.connected ? <><button className="btn-secondary" onClick={() => void calendarAction('sync')}>Sync all</button><button className="btn-secondary" onClick={() => void calendarAction('disconnect')}>Disconnect</button></> : <button className="btn-primary" onClick={() => void calendarAction('connect')}>Connect Google Calendar</button>}</div></section>
    <div className="schedule-toolbar"><div className="schedule-filters">{(['today','week','upcoming','completed','all'] as const).map(value => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'week' ? 'This Week' : value[0].toUpperCase()+value.slice(1)}</button>)}</div><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search schedules or students…" /></div>
    {loading ? <CardGridSkeleton cards={3} /> : visible.length === 0 ? <div className="schedule-empty"><strong>No schedules found</strong><p>Create a schedule to define intern working hours and attendance expectations.</p></div> : <div className="schedule-list">{visible.map(schedule => <article key={schedule.id} className="schedule-card"><div className="schedule-card-top"><div><h3>{schedule.name}</h3><p>{schedule.start_date || 'No start date'}{schedule.end_date ? ` — ${schedule.end_date}` : ''}</p></div><span className={`schedule-status ${schedule.status}`}>{schedule.status}</span></div><div className="schedule-summary"><strong>{time(schedule.start_time)} – {time(schedule.end_time)}</strong><span>{schedule.recurrence === 'none' ? 'Does not repeat' : schedule.working_days.map(day => day.slice(0,3)).join(' · ')}</span><span>{schedule.location || 'No location'} · Supervisor: {schedule.supervisor_name || 'Not specified'}</span></div><div className="schedule-card-bottom"><span>{schedule.assigned_students.length} students assigned</span><span className={`sync-state ${schedule.calendar_sync_status}`}>{schedule.calendar_sync_status.replace('_',' ')}</span><div><button className="btn-secondary" onClick={() => void openDetails(schedule)}>View</button><button className="btn-secondary" onClick={() => edit(schedule)}>Edit</button>{calendar?.connected && <button className="btn-secondary" onClick={() => void calendarAction('sync', schedule.id)}>Sync</button>}</div></div></article>)}</div>}
    {editing && <div className="schedule-modal-backdrop" onMouseDown={closeForm}><form className="schedule-modal" onSubmit={save} onMouseDown={event => event.stopPropagation()}><header><div><h3>{form.id ? 'Edit Schedule' : 'Add Schedule'}</h3><p>Only interns assigned to your company can be selected.</p></div><button type="button" onClick={closeForm}>×</button></header><div className="schedule-form-grid"><label className="wide">Schedule name<input required value={form.name} onChange={event => setForm({...form,name:event.target.value})} placeholder="OJT Morning Shift" /></label><label>Start date<input required type="date" value={form.start_date} onChange={event => setForm({...form,start_date:event.target.value})} /></label><label>End date<input type="date" value={form.end_date || ''} onChange={event => setForm({...form,end_date:event.target.value || null})} /></label><label>Start time<input required type="time" value={form.start_time} onChange={event => setForm({...form,start_time:event.target.value})} /></label><label>End time<input required type="time" value={form.end_time} onChange={event => setForm({...form,end_time:event.target.value})} /></label><label>Break duration (minutes)<input required type="number" min="0" max="480" value={form.break_duration_minutes} onChange={event => setForm({...form,break_duration_minutes:Number(event.target.value)})} /></label><label>Recurrence<select value={form.recurrence} onChange={event => setForm({...form,recurrence:event.target.value as ScheduleInput['recurrence']})}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="custom_weekdays">Custom weekdays</option></select></label><label>Location<input value={form.location || ''} onChange={event => setForm({...form,location:event.target.value})} /></label><label>Supervisor<input value={form.supervisor_name || ''} onChange={event => setForm({...form,supervisor_name:event.target.value})} /></label><div className="wide"><span className="field-label">Working days</span><div className="day-picker">{DAYS.map(day => <button type="button" key={day} disabled={form.recurrence === 'none' || form.recurrence === 'daily'} className={form.working_days.includes(day) ? 'selected' : ''} onClick={() => toggle('working_days',day)}>{day.slice(0,3)}</button>)}</div></div><label className="wide">Notes<textarea value={form.notes || ''} onChange={event => setForm({...form,notes:event.target.value})} /></label></div><section className="student-picker"><div><strong>Assigned students</strong><span>{form.student_ids.length} selected</span></div><input value={studentSearch} onChange={event => setStudentSearch(event.target.value)} placeholder="Search assigned students…" /><div className="student-options">{matches.map(student => <label key={student.auth_user_id}><input type="checkbox" checked={form.student_ids.includes(student.auth_user_id)} onChange={() => toggle('student_ids',student.auth_user_id)} /><span><strong>{name(student)}</strong><small>{[student.course,student.department].filter(Boolean).join(' · ') || student.email}</small></span></label>)}</div></section><footer><button type="button" className="btn-secondary" onClick={closeForm}>Cancel</button><button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Schedule'}</button></footer></form></div>}
    {details && <div className="schedule-modal-backdrop" onMouseDown={() => setDetails(null)}><section className="schedule-modal schedule-details" onMouseDown={event => event.stopPropagation()}><header><div><h3>{details.name}</h3><p>{time(details.start_time)} – {time(details.end_time)} · {details.break_duration_minutes} minute break</p></div><button onClick={() => setDetails(null)}>×</button></header><div className="details-section"><strong>Assigned students</strong>{details.assigned_students.map(student => <div key={student.student_id}>{name(student)} <small>{[student.course,student.department].filter(Boolean).join(' · ')}</small></div>)}</div><div className="details-section"><strong>Notes</strong><p>{details.notes || 'No notes provided.'}</p></div><div className="details-section"><strong>Schedule history</strong>{history.length ? history.map(item => <div key={item.id}><b>{item.action.replaceAll('_',' ')}</b><small>{item.actor_name || 'Company user'} · {new Date(item.created_at).toLocaleString()}</small></div>) : <p>No history available yet.</p>}</div><footer><button className="btn-secondary" onClick={() => edit(details)}>Edit</button><button className="schedule-delete" onClick={() => void remove(details)}>Delete Schedule</button></footer></section></div>}
  </div>;
};
export default CompanyScheduleView;
