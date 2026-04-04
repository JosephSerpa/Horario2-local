import { useState, useEffect, useMemo } from 'react';
import { useAppStore, DayOfWeek } from '../store';
import { Clock, User, BookOpen } from 'lucide-react';

export function NowPage() {
  const { classrooms, courses, sessions, professors, loadFromCloud } = useAppStore();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Force dark mode for this specific page for better screen visibility
    document.documentElement.classList.add('dark');
    
    const timer = setInterval(() => {
      setCurrentTime(new Date());
      // Fetch latest data from cloud silently every 10 seconds
      loadFromCloud(true);
    }, 10000); // Update every 10 seconds
    return () => clearInterval(timer);
  }, [loadFromCloud]);

  const effectiveTime = useMemo(() => new Date(currentTime.getTime() + 5 * 60000), [currentTime]);

  const currentDay = useMemo(() => {
    const day = effectiveTime.getDay();
    return ((day + 6) % 7) as DayOfWeek;
  }, [effectiveTime]);

  const currentMinutes = effectiveTime.getHours() * 60 + effectiveTime.getMinutes();

  const activeSessions = useMemo(() => {
    const active = new Map<string, { session: any, status: 'active' | 'upcoming' }>();
    
    // Group sessions by classroom for the current day
    const classroomSessionsMap = new Map<string, any[]>();
    sessions.forEach(session => {
      if (session.dayOfWeek !== currentDay) return;
      if (session.isActive === false) return;
      
      if (!classroomSessionsMap.has(session.classroomId)) {
        classroomSessionsMap.set(session.classroomId, []);
      }
      classroomSessionsMap.get(session.classroomId)!.push(session);
    });

    classroomSessionsMap.forEach((roomSessions, roomId) => {
      // Sort sessions by start time
      roomSessions.sort((a, b) => {
        const aStart = parseInt(a.startTime.split(':')[0]) * 60 + parseInt(a.startTime.split(':')[1]);
        const bStart = parseInt(b.startTime.split(':')[0]) * 60 + parseInt(b.startTime.split(':')[1]);
        return aStart - bStart;
      });

      let currentActiveSession = null;
      let nextUpcomingSession = null;

      for (const session of roomSessions) {
        const [startH, startM] = session.startTime.split(':').map(Number);
        const [endH, endM] = session.endTime.split(':').map(Number);
        
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;

        if (currentMinutes >= startTotal && currentMinutes < endTotal) {
          // It's currently active. We only take the first one if there are overlaps.
          if (!currentActiveSession) {
            currentActiveSession = session;
          }
        } else if (startTotal > currentMinutes && (startTotal - currentMinutes) <= 120) {
          // It's upcoming within 2 hours
          if (!nextUpcomingSession) {
            nextUpcomingSession = session;
          }
        }
      }

      if (currentActiveSession) {
        active.set(roomId, { session: currentActiveSession, status: 'active' });
      } else if (nextUpcomingSession) {
        active.set(roomId, { session: nextUpcomingSession, status: 'upcoming' });
      }
    });
    
    return active;
  }, [sessions, currentDay, currentMinutes]);

  // We need exactly 6 classrooms for the 2x3 grid.
  const displayClassrooms = classrooms.slice(0, 6);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 flex flex-col font-sans selection:bg-indigo-500/30">
      <header className="flex justify-between items-center mb-8 px-4">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <BookOpen size={32} className="text-white" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tight">Estado de Aulas</h1>
        </div>
        <div className="text-6xl font-mono font-bold text-amber-400 flex items-center gap-4 bg-zinc-900/80 px-8 py-4 rounded-3xl border border-zinc-800 shadow-xl">
          <Clock size={48} className="animate-pulse" />
          {currentTime.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>
      
      <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-6">
        {displayClassrooms.map(classroom => {
          const classroomData = activeSessions.get(classroom.id);
          const session = classroomData?.session;
          const status = classroomData?.status;
          
          return (
            <div 
              key={classroom.id} 
              className={`rounded-[2rem] p-8 flex flex-col border-4 transition-all duration-500 ${
                session 
                  ? (status === 'active' 
                      ? 'bg-zinc-900 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.15)]' 
                      : 'bg-zinc-900 border-amber-500/30 shadow-[0_0_40px_rgba(245,158,11,0.15)]')
                  : 'bg-zinc-900/40 border-zinc-800/50'
              }`}
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-5xl font-black text-white tracking-tight">{classroom.name}</h2>
                </div>
                {session && (
                  <span className={`px-5 py-2 rounded-2xl text-3xl font-bold border ${status === 'active' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                    {session.startTime} - {session.endTime}
                  </span>
                )}
              </div>
              
              {session ? (
                <div className="flex-1 flex flex-col justify-center space-y-6 overflow-y-auto pr-2 custom-scrollbar">
                  {(() => {
                    const course = courses.find(c => c.id === session.courseId);
                    const professor = professors.find(p => p.id === session.professor) || { name: session.professor };
                    const displayGroup = session.module 
                      ? (session.module.toLowerCase().startsWith('mód') || session.module.toLowerCase().startsWith('mod') 
                        ? session.module 
                        : `Módulo ${session.module}`)
                      : null;

                    return (
                      <div className="flex flex-col">
                        <div className="space-y-2 mb-4">
                          <div className="flex items-center gap-3 text-zinc-400 mb-2">
                            {status === 'active' ? (
                              <>
                                <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-2xl font-bold uppercase tracking-widest text-emerald-500/90">En Curso</span>
                              </>
                            ) : (
                              <>
                                <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                                <span className="text-2xl font-bold uppercase tracking-widest text-amber-500/90">Próxima Clase</span>
                              </>
                            )}
                          </div>
                          <h3 className="text-[3.5rem] leading-[1.1] font-black text-white line-clamp-2" style={{ color: course?.color || '#fff' }}>
                            {course?.name}
                          </h3>
                        </div>
                        
                        <div className="flex flex-col gap-6">
                          <div className="flex items-center gap-4 text-zinc-300">
                            <div className="p-3 bg-zinc-800 rounded-2xl">
                              <User size={36} className="text-zinc-400" />
                            </div>
                            <span className="text-4xl font-semibold">{professor?.name}</span>
                          </div>
                          
                          {displayGroup && (
                            <div className="flex items-center gap-4 flex-wrap mt-2">
                              <div className="text-5xl font-black text-indigo-300 bg-indigo-500/10 px-8 py-5 rounded-3xl border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
                                {displayGroup}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-600">
                  <div className="w-32 h-32 rounded-full bg-zinc-800/50 flex items-center justify-center mb-8">
                    <Clock size={64} className="opacity-40" />
                  </div>
                  <p className="text-4xl font-bold text-zinc-500">Aula Disponible</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
