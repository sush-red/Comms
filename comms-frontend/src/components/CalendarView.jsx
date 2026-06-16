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
  const [attendees, setAttendees] = useState(''); // Comma separated usernames
  const [description, setDescription] = useState('');

  const fetchEvents = () => {
    socket.emit('get events');
  };

  useEffect(() => {
    // Initial fetch
    fetchEvents();

    // Listeners
    socket.on('events data', (data) => {
      // Postgres JSONB parsing safety check
      const parsedEvents = data.map(ev => ({
        ...ev,
        attendeesList: typeof ev.attendees === 'string' ? JSON.parse(ev.attendees) : ev.attendees
      }));
      
      // Sort by date/time
      parsedEvents.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
      setEvents(parsedEvents);
    });

    socket.on('event refresh', fetchEvents);
    socket.on('new meeting invite', fetchEvents);
    socket.on('meeting cancelled', fetchEvents);

    return () => {
      socket.off('events data');
      socket.off('event refresh');
      socket.off('new meeting invite');
      socket.off('meeting cancelled');
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
    setTitle(''); setDate(''); setStartTime(''); setEndTime(''); setAttendees(''); setDescription('');
  };

  const handleRSVP = (eventId, status) => {
    socket.emit('rsvp event', { eventId, status });
  };

  const handleCancel = (eventId) => {
    if (window.confirm("Are you sure you want to cancel this meeting?")) {
      socket.emit('cancel event', eventId);
    }
  };

  const formatTime = (isoString) => {
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 bg-surface-container-lowest flex flex-col relative overflow-hidden">
      {/* Header */}
      <header className="bg-surface shadow-sm px-6 py-4 flex items-center justify-between border-b border-border-subtle z-10">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Schedule</h2>
          <p className="text-sm text-on-surface-variant">Manage your meetings and RSVPs</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-primary text-white px-4 py-2 rounded-lg font-bold hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2"
        >
          <span>+</span> New Meeting
        </button>
      </header>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-6 bg-background chat-scroll">
        {events.length === 0 ? (
          <div className="text-center text-on-surface-variant mt-20">
            <span className="text-6xl block mb-4">📭</span>
            <h3 className="text-lg font-bold">No upcoming meetings</h3>
            <p>Your schedule is clear!</p>
          </div>
        ) : (
          <div className="grid gap-4 max-w-4xl mx-auto">
            {events.map(ev => {
              const isOrganizer = ev.organizer === currentUser.username;
              const myRsvp = ev.attendeesList.find(a => a.username === currentUser.username)?.status;

              return (
                <div key={ev.id} className="bg-white border border-border-subtle rounded-xl p-5 shadow-sm flex flex-col md:flex-row gap-4">
                  
                  {/* Date & Time Block */}
                  <div className="md:w-32 flex flex-col justify-center items-center bg-primary/5 rounded-lg p-3 text-primary">
                    <span className="text-sm font-bold uppercase">{formatDate(ev.start_time)}</span>
                    <span className="text-lg font-black">{formatTime(ev.start_time)}</span>
                  </div>

                  {/* Details Block */}
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-on-surface">{ev.title}</h3>
                    <p className="text-sm text-on-surface-variant mb-3">{ev.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      <span className="bg-surface-container text-xs px-2 py-1 rounded font-semibold text-primary">
                        👑 {ev.organizer}
                      </span>
                      {ev.attendeesList.map((att, i) => (
                        <span key={i} className={`text-xs px-2 py-1 rounded font-semibold border ${
                          att.status === 'accepted' ? 'bg-green-50 border-green-200 text-green-700' :
                          att.status === 'declined' ? 'bg-red-50 border-red-200 text-red-700' :
                          'bg-gray-50 border-gray-200 text-gray-600'
                        }`}>
                          {att.username} ({att.status})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Actions Block */}
                  <div className="flex items-center justify-end md:w-48 gap-2">
                    {isOrganizer ? (
                      <button onClick={() => handleCancel(ev.id)} className="px-4 py-2 bg-red-100 text-red-700 font-bold rounded-lg hover:bg-red-200 transition text-sm w-full">
                        Cancel Meeting
                      </button>
                    ) : (
                      <div className="flex gap-2 w-full">
                        <button 
                          onClick={() => handleRSVP(ev.id, 'accepted')}
                          disabled={myRsvp === 'accepted'}
                          className={`flex-1 py-2 font-bold rounded-lg text-sm transition ${myRsvp === 'accepted' ? 'bg-green-500 text-white cursor-default' : 'bg-surface-container hover:bg-green-100 text-on-surface'}`}
                        >
                          ✓
                        </button>
                        <button 
                          onClick={() => handleRSVP(ev.id, 'declined')}
                          disabled={myRsvp === 'declined'}
                          className={`flex-1 py-2 font-bold rounded-lg text-sm transition ${myRsvp === 'declined' ? 'bg-red-500 text-white cursor-default' : 'bg-surface-container hover:bg-red-100 text-on-surface'}`}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Event Modal */}
      {showModal && (
        <div className="absolute inset-0 bg-on-surface/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-background">
              <h3 className="font-bold text-lg">Schedule Meeting</h3>
              <button onClick={() => setShowModal(false)} className="text-on-surface-variant hover:text-on-surface font-bold">✕</button>
            </div>
            <form onSubmit={handleCreateEvent} className="p-6 space-y-4 overflow-y-auto chat-scroll max-h-[70vh]">
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Meeting Title</label>
                <input required type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full p-2 border rounded outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Date</label>
                  <input required type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-2 border rounded outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Start Time</label>
                  <input required type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-2 border rounded outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">End Time</label>
                  <input required type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full p-2 border rounded outline-none focus:border-primary" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Invitees (comma separated)</label>
                <input placeholder="Alex, John, Sarah" type="text" value={attendees} onChange={e => setAttendees(e.target.value)} className="w-full p-2 border rounded outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-bold text-on-surface-variant mb-1">Description</label>
                <textarea rows="3" value={description} onChange={e => setDescription(e.target.value)} className="w-full p-2 border rounded outline-none focus:border-primary resize-none"></textarea>
              </div>
              <button type="submit" className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 mt-4">Send Invites</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}