import { useState, useEffect } from 'react';
import socket from '../socket';

export default function CalendarView({ currentUser }) {
  const [events, setEvents] = useState([]);
  const [showModal, setShowModal] = useState(false);
  
  // New Event Form State
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [attendees, setAttendees] = useState('');
  const [description, setDescription] = useState('');

  // Scheduling Assistant State
  const [suggestedTimes, setSuggestedTimes] = useState([]);
  const [isChecking, setIsChecking] = useState(false);

  const fetchEvents = () => {
    socket.emit('get events');
  };

  useEffect(() => {
    fetchEvents();

    // Core Calendar Listeners
    socket.on('events data', (data) => {
      const parsedEvents = data.map(ev => ({
        ...ev,
        attendeesList: typeof ev.attendees === 'string' ? JSON.parse(ev.attendees) : ev.attendees
      }));
      parsedEvents.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      setEvents(parsedEvents);
    });

    socket.on('event refresh', fetchEvents);
    socket.on('new meeting invite', fetchEvents);
    socket.on('meeting cancelled', fetchEvents);

    // Scheduling Assistant Listener
    socket.on('availability suggestions', (slots) => {
      setSuggestedTimes(slots);
      setIsChecking(false);
    });

    return () => {
      socket.off('events data');
      socket.off('event refresh');
      socket.off('new meeting invite');
      socket.off('meeting cancelled');
      socket.off('availability suggestions');
    };
  }, []);

  const handleCreateEvent = (e) => {
    e.preventDefault();
    const startIso = `${date}T${startTime}`;
    const endIso = `${date}T${endTime}`;
    const attendeeArray = attendees.split(',').map(a => a.trim()).filter(a => a);

    socket.emit('create event', {
      title,
      startTime: startIso,
      endTime: endIso,
      description,
      attendees: attendeeArray
    });

    setShowModal(false);
    setTitle(''); setDate(''); setStartTime(''); setEndTime(''); setAttendees(''); setDescription(''); setSuggestedTimes([]);
  };

  const handleRSVP = (eventId, status) => {
    socket.emit('rsvp event', { eventId, status });
  };

  const handleCancel = (eventId) => {
    if (window.confirm("Are you sure you want to cancel this meeting?")) {
      socket.emit('cancel event', eventId);
    }
  };

  // Trigger the Scheduling Assistant
  const handleCheckAvailability = () => {
    if (!date || !attendees.trim()) return;
    setIsChecking(true);
    const attendeeArray = attendees.split(',').map(a => a.trim()).filter(a => a);
    
    // Request free slots from the Node backend
    socket.emit('check availability', { 
      date, 
      attendees: attendeeArray,
      durationMinutes: 60 // Defaulting to 1 hour search window
    });
  };

  // Helper functions for Timeline formatting
  const formatTimeSplit = (isoString) => {
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    return { time: `${hours.toString().padStart(2, '0')}:${minutes}`, ampm };
  };

  const formatDuration = (startIso, endIso) => {
    const diffMs = new Date(endIso) - new Date(startIso);
    const diffHrs = diffMs / (1000 * 60 * 60);
    return `${diffHrs}h`;
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-background text-on-surface">
      {/* Header / Controls */}
      <header className="h-20 px-8 flex items-center justify-between border-b border-outline-variant/30 bg-surface/80 backdrop-blur-xl z-20 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold text-on-surface">Schedule</h2>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-lg text-sm font-bold hover:bg-primary-container transition-colors shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            New Meeting
          </button>
        </div>
      </header>

      {/* Calendar Canvas */}
      <div className="flex-1 overflow-y-auto p-8 relative scroll-smooth custom-scrollbar">
        <div className="absolute inset-0 pointer-events-none opacity-20 dark:opacity-10" style={{ backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
        
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="relative pl-2 mt-8">
            {events.length === 0 ? (
              <div className="text-center text-on-surface-variant mt-20 p-8 glass-panel rounded-xl border border-outline-variant/30">
                <span className="material-symbols-outlined text-[48px] mb-4 opacity-50">event_busy</span>
                <h3 className="text-lg font-bold">No upcoming meetings</h3>
                <p>Your schedule is clear!</p>
              </div>
            ) : (
              events.map((ev) => {
                const isOrganizer = ev.organizer === currentUser.username;
                const myRsvp = ev.attendeesList.find(a => a.username === currentUser.username)?.status;
                const { time, ampm } = formatTimeSplit(ev.start_time);
                
                let statusColor = 'bg-primary'; let statusRing = 'ring-primary/20'; let statusText = 'text-primary'; let bgTint = 'bg-primary/10'; let borderTint = 'border-primary/20';
                if (myRsvp === 'accepted' || isOrganizer) {
                  statusColor = 'bg-secondary'; statusRing = 'ring-secondary/20'; statusText = 'text-secondary'; bgTint = 'bg-secondary/10'; borderTint = 'border-secondary/20';
                } else if (myRsvp === 'declined') {
                  statusColor = 'bg-error'; statusRing = 'ring-error/20'; statusText = 'text-error'; bgTint = 'bg-error/10'; borderTint = 'border-error/20';
                } else {
                  statusColor = 'bg-yellow-500'; statusRing = 'ring-yellow-500/20'; statusText = 'text-yellow-500'; bgTint = 'bg-yellow-500/10'; borderTint = 'border-yellow-500/20';
                }

                return (
                  <div key={ev.id} className="relative pl-12 pb-10 timeline-item timeline-line group">
                    <div className="absolute left-0 top-0 w-12 text-right pr-4 text-xs font-bold text-on-surface-variant pt-1">
                      {time}<br/><span className="opacity-50">{ampm}</span>
                    </div>
                    <div className={`absolute left-[19px] top-[6px] w-[10px] h-[10px] rounded-full ${statusColor} ring-4 ${statusRing} ring-background z-10 group-hover:scale-125 transition-transform duration-300`}></div>
                    
                    <div className={`glass-panel rounded-2xl p-6 hover:border-outline-variant/60 transition-all duration-300 relative overflow-hidden ${myRsvp === 'declined' ? 'opacity-60' : ''}`}>
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColor}`}></div>
                      
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className={`text-lg font-bold mb-1 ${myRsvp === 'declined' ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>{ev.title}</h4>
                          <p className="text-sm text-on-surface-variant flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">schedule</span> 
                            {time} {ampm} ({formatDuration(ev.start_time, ev.end_time)})
                          </p>
                        </div>
                        <div className={`px-3 py-1 rounded-full ${bgTint} border ${borderTint} flex items-center gap-2`}>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${statusText}`}>
                            {isOrganizer ? 'Organizer' : myRsvp || 'Pending'}
                          </span>
                        </div>
                      </div>

                      {ev.description && (
                        <div className="bg-surface-container-low rounded-lg p-3 mt-4 border border-outline-variant/30 flex items-start gap-3">
                          <span className="material-symbols-outlined text-on-surface-variant text-[20px]">description</span>
                          <p className="text-sm text-on-surface">{ev.description}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-outline-variant/30 justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-high flex items-center justify-center text-xs font-bold text-on-surface">
                            +{ev.attendeesList.length}
                          </div>
                          <span className="text-xs font-bold text-on-surface-variant">Invited</span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          {isOrganizer ? (
                            <button onClick={() => handleCancel(ev.id)} className="px-4 py-1.5 rounded-md bg-error/10 text-error border border-error/30 text-sm font-bold hover:bg-error/20 transition-colors">
                              Cancel Meeting
                            </button>
                          ) : (
                            <>
                              <button onClick={() => handleRSVP(ev.id, 'accepted')} disabled={myRsvp === 'accepted'} className="px-4 py-1.5 rounded-md bg-secondary/10 text-secondary border border-secondary/30 text-sm font-bold hover:bg-secondary/20 transition-colors disabled:opacity-50">Accept</button>
                              <button onClick={() => handleRSVP(ev.id, 'declined')} disabled={myRsvp === 'declined'} className="px-4 py-1.5 rounded-md text-on-surface-variant border border-outline-variant/50 text-sm font-bold hover:bg-surface-container transition-colors disabled:opacity-50">Decline</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Frosted Glass Modal Overlay for New Meeting */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface-container rounded-2xl shadow-2xl border border-outline-variant/50 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-outline-variant/30 flex justify-between items-center bg-surface-container-highest/50">
              <h2 className="text-lg text-on-surface font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">event</span> Schedule Meeting
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded-full transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleCreateEvent} className="p-6 overflow-y-auto space-y-6 max-h-[80vh]">
              <div>
                <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-transparent border-0 border-b-2 border-outline-variant/50 focus:border-primary focus:ring-0 px-0 py-2 text-2xl font-bold text-on-surface placeholder:text-on-surface-variant/50 transition-colors outline-none" placeholder="Add meeting title" type="text" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Attendees</label>
                <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded-lg border border-outline-variant/50 focus-within:border-primary focus-within:ring-1">
                  <span className="material-symbols-outlined text-on-surface-variant ml-2">person_add</span>
                  <input required value={attendees} onChange={e => setAttendees(e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm text-on-surface outline-none" placeholder="Comma separated usernames (e.g. David, Sarah)" type="text" />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Date</label>
                  <div className="flex items-center gap-2 p-2 bg-surface-container-low rounded-lg border border-outline-variant/50">
                    <span className="material-symbols-outlined text-on-surface-variant ml-2">calendar_month</span>
                    <input required value={date} onChange={e => setDate(e.target.value)} className="w-full bg-transparent border-0 focus:ring-0 text-sm text-on-surface outline-none [color-scheme:dark]" type="date" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Start</label>
                    <input required value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full bg-surface-container-low rounded-lg border border-outline-variant/50 p-2 text-sm text-on-surface outline-none [color-scheme:dark]" type="time" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">End</label>
                    <input required value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full bg-surface-container-low rounded-lg border border-outline-variant/50 p-2 text-sm text-on-surface outline-none [color-scheme:dark]" type="time" />
                  </div>
                </div>
              </div>

              {/* ✨ SCHEDULING ASSISTANT ✨ */}
              {attendees.trim() && date && (
                <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/30 shadow-inner relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                  <div className="flex justify-between items-center mb-3 ml-2">
                    <label className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                      Scheduling Assistant
                    </label>
                    <button 
                      type="button" 
                      onClick={handleCheckAvailability}
                      disabled={isChecking}
                      className="text-xs bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-full transition-colors font-bold disabled:opacity-50"
                    >
                      {isChecking ? 'Scanning Calendars...' : 'Find Free Time'}
                    </button>
                  </div>
                  
                  {suggestedTimes.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-outline-variant/20 ml-2">
                      {suggestedTimes.map((slot, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => { setStartTime(slot.start); setEndTime(slot.end); }}
                          className="text-xs bg-surface-container-highest hover:bg-primary hover:text-on-primary text-on-surface px-3 py-1.5 rounded-lg transition-colors border border-outline-variant/50 hover:border-primary shadow-sm"
                        >
                          {slot.start} - {slot.end}
                        </button>
                      ))}
                    </div>
                  )}
                  {suggestedTimes.length === 0 && !isChecking && (
                    <p className="text-xs text-on-surface-variant ml-2 mt-1">Click to find overlapping free slots for your attendees.</p>
                  )}
                </div>
              )}
              
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-surface-container-low rounded-lg border border-outline-variant/50 focus:border-primary p-3 text-sm text-on-surface placeholder:text-on-surface-variant/50 resize-none outline-none" placeholder="Add agenda or details..." rows="3"></textarea>
              </div>
              
              <div className="pt-4 border-t border-outline-variant/30 flex justify-end gap-4">
                <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2 rounded-lg text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors">Cancel</button>
                <button type="submit" className="px-6 py-2 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary-container transition-colors shadow-lg">Send Invites</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}