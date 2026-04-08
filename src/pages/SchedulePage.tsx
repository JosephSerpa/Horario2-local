import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, DayOfWeek } from '../store';
import { useTranslation } from '../i18n';

import { Clock, Users, BookOpen, User as UserIcon, Printer, Code, AlertTriangle, Camera } from 'lucide-react';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 8 to 23

export function SchedulePage() {
  const { classrooms, courses, sessions, language, isAdmin } = useAppStore();
  const navigate = useNavigate();
  const t = useTranslation(language);
  const [activeDay, setActiveDay] = useState<DayOfWeek>(() => {
    const day = new Date().getDay();
    return ((day + 6) % 7) as DayOfWeek;
  });
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const day = new Date().getDay();
    const today = ((day + 6) % 7) as DayOfWeek;
    setActiveDay(today);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000); // Update every 30 seconds
    return () => clearInterval(timer);
  }, []);

  const activeSessions = useMemo(() => {
    return sessions.filter((s) => s.dayOfWeek === activeDay && s.isActive !== false);
  }, [sessions, activeDay]);

  const hasAlert = (session: any) => {
    return !session.professor || session.professor.trim() === '' || session.studentsCount <= 4;
  };

  const getSessionStyle = (session: any, allSessions: any[] = []) => {
    const [startHour, startMinute] = session.startTime.split(':').map(Number);
    const [endHour, endMinute] = session.endTime.split(':').map(Number);
    
    const startTotalMinutes = (startHour - 8) * 60 + startMinute;
    const endTotalMinutes = (endHour - 8) * 60 + endMinute;
    const durationMinutes = endTotalMinutes - startTotalMinutes;
    
    const topPercentage = (startTotalMinutes / (16 * 60)) * 100;
    const heightPercentage = (durationMinutes / (16 * 60)) * 100;
    
    const course = courses.find((c) => c.id === session.courseId);
    const color = course?.color || '#3b82f6'; // default blue

    // Calculate overlaps
    const overlappingSessions = allSessions.filter(s => {
      if (s.classroomId !== session.classroomId || s.dayOfWeek !== session.dayOfWeek) return false;
      const sStart = parseInt(s.startTime.split(':')[0]) * 60 + parseInt(s.startTime.split(':')[1]);
      const sEnd = parseInt(s.endTime.split(':')[0]) * 60 + parseInt(s.endTime.split(':')[1]);
      return sStart < endTotalMinutes && sEnd > startTotalMinutes;
    }).sort((a, b) => {
      const aStart = parseInt(a.startTime.split(':')[0]) * 60 + parseInt(a.startTime.split(':')[1]);
      const bStart = parseInt(b.startTime.split(':')[0]) * 60 + parseInt(b.startTime.split(':')[1]);
      if (aStart !== bStart) return aStart - bStart;
      return a.id.localeCompare(b.id);
    });

    const overlapIndex = overlappingSessions.findIndex(s => s.id === session.id);
    const offset = overlapIndex > 0 ? overlapIndex * 20 : 0;

    return {
      top: `calc(${topPercentage}% + ${offset}px)`,
      height: `calc(${heightPercentage}% - ${offset}px)`,
      left: `calc(0.25rem + ${offset}px)`,
      width: `calc(100% - 0.5rem - ${offset}px)`,
      zIndex: 10 + overlapIndex,
      background: `linear-gradient(135deg, ${color} 0%, ${color}dd 40%, #ffffff 250%)`,
      color: '#ffffff',
      boxShadow: overlapIndex > 0 ? `-4px 4px 16px 0 rgba(0,0,0,0.25), 0 4px 12px 0 ${color}40` : `0 4px 12px 0 ${color}30`,
      border: `2px solid #ffffff`,
    };
  };

  const handlePrint = () => {
    setShowPrintPreview(true);
  };

  const confirmPrint = () => {
    window.print();
    setShowPrintPreview(false);
  };

  const currentTimePos = useMemo(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    
    if (hours < 8 || hours >= 23) return null;
    
    const totalMinutes = (hours - 8) * 60 + minutes;
    return (totalMinutes / (16 * 60)) * 100;
  }, [currentTime]);

  const todayIndex = useMemo(() => {
    const day = (currentTime.getDay() + 6) % 7;
    return day as DayOfWeek;
  }, [currentTime]);

  const isToday = useMemo(() => {
    return todayIndex === activeDay;
  }, [todayIndex, activeDay]);

  const nextEvent = useMemo(() => {
    if (!isToday) return null;
    
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const allTimes: number[] = [];
    
    activeSessions.forEach(s => {
      const [sH, sM] = s.startTime.split(':').map(Number);
      const [eH, eM] = s.endTime.split(':').map(Number);
      allTimes.push(sH * 60 + sM);
      allTimes.push(eH * 60 + eM);
    });
    
    const futureTimes = allTimes.filter(t => t > nowMinutes).sort((a, b) => a - b);
    
    if (futureTimes.length === 0) return null;
    
    const nextTime = futureTimes[0];
    const diff = nextTime - nowMinutes;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    
    return { h, m };
  }, [activeSessions, currentTime, isToday]);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 font-sans">
            {t.schedule}
          </h1>
          <div className="flex flex-col w-full sm:w-auto sm:items-center gap-2 sm:gap-3 no-print">
            {nextEvent && (
              <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-amber-700 dark:text-amber-400 w-full sm:w-auto justify-center sm:justify-start">
                <Clock size={14} className="animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  Cambio en: <span className="text-xs font-black ml-1">
                    {nextEvent.h > 0 ? `${nextEvent.h}h ` : ''}{nextEvent.m}min
                  </span>
                </span>
              </div>
            )}
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium w-full sm:w-auto"
            >
              <Printer size={18} />
              Imprimir
            </button>
          </div>
        </div>
        
        {/* Day Tabs */}
        <div className="flex overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 gap-2 hide-scrollbar">
          {t.days.map((day, index) => (
            <button
              key={index}
              onClick={() => setActiveDay(index as DayOfWeek)}
              className={`px-6 py-3 rounded-2xl font-medium text-sm whitespace-nowrap transition-all duration-300 border-2 ${
                activeDay === index
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-md scale-105 border-transparent'
                  : index === todayIndex
                    ? 'bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 border-amber-500 dark:border-amber-500'
                    : 'bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 border-transparent'
              }`}
            >
              {day}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Schedule Grid */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
        <div className="overflow-x-auto overscroll-x-contain">
          <div className="min-w-[760px] sm:min-w-[800px]">
            {/* Header Row */}
            <div className="grid grid-cols-[80px_repeat(6,1fr)] border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
              <div className="p-4 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Hora
              </div>
              {classrooms.map((classroom) => (
                <div key={classroom.id} className="p-4 text-center text-sm font-semibold text-zinc-700 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-800">
                  {classroom.name}
                </div>
              ))}
            </div>

            {/* Grid Body */}
            <div className="relative grid grid-cols-[80px_repeat(6,1fr)] bg-white dark:bg-zinc-900 h-[1200px] print-grid">
              {/* Current Time Indicator */}
              {isToday && currentTimePos !== null && (
                <div 
                  className="absolute left-[80px] right-0 h-0.5 bg-red-500 z-20 pointer-events-none flex items-center no-print"
                  style={{ top: `${currentTimePos}%` }}
                >
                  <div className="w-2 h-2 bg-red-500 rounded-full -ml-1 shadow-sm" />
                  <div className="ml-2 px-1.5 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded shadow-sm">
                    {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              )}
              
              {/* Time Column */}
              <div className="relative border-r border-zinc-200 dark:border-zinc-800">
                {HOURS.map((hour) => (
                  <div key={hour} className="absolute w-full text-right pr-4 text-xs font-medium text-zinc-400 dark:text-zinc-500" style={{ top: `${((hour - 8) / 16) * 100}%`, transform: 'translateY(-50%)' }}>
                    {hour.toString().padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {/* Classroom Columns */}
              {classrooms.map((classroom, colIndex) => (
                <div key={classroom.id} className="relative border-r border-zinc-200 dark:border-zinc-800 last:border-r-0">
                  {/* Horizontal Grid Lines */}
                  {HOURS.map((hour) => (
                    <div key={hour} className="absolute w-full border-t border-zinc-100 dark:border-zinc-800/50" style={{ top: `${((hour - 8) / 16) * 100}%` }} />
                  ))}

                  {/* Sessions */}
                  <AnimatePresence>
                    {activeSessions
                      .filter((s) => s.classroomId === classroom.id)
                      .map((session) => {
                        const course = courses.find((c) => c.id === session.courseId);
                        return (
                          <motion.div
                            key={session.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                            className="absolute rounded-xl p-2 overflow-hidden transition-all hover:!z-50 hover:scale-[1.02] group"
                            style={getSessionStyle(session, activeSessions)}
                          >
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/registros?sessionId=${session.id}&day=${activeDay}`);
                                }}
                                className="absolute bottom-1 right-1 p-1 rounded-md bg-black/35 hover:bg-black/55 text-white no-print z-20 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                                title="Agregar registro de salon"
                              >
                                <Camera size={11} />
                              </button>
                            )}
                            <div className="flex items-center gap-1 mb-1">
                              <BookOpen size={10} className="shrink-0" />
                              <div className="text-xs font-bold truncate">{course?.name || 'Unknown'}</div>
                            </div>
                            
                            <div className="flex items-center gap-1 text-[10px] opacity-90 truncate mb-1">
                              <UserIcon size={10} className="shrink-0" />
                              <span>{session.professor}</span>
                            </div>

                            <div className="flex flex-col gap-0.5 mt-auto">
                              <div className="flex items-center gap-1 text-[10px] opacity-90">
                                <Clock size={10} className="shrink-0" />
                                <span>{session.startTime} - {session.endTime}</span>
                              </div>
                              <div className="flex items-center gap-1 text-[10px] opacity-90">
                                <Users size={10} className="shrink-0" />
                                <span className="font-medium">{session.studentsCount} alumnos</span>
                              </div>
                            </div>

                            <div className="text-[10px] opacity-80 mt-1 truncate flex items-center gap-1">
                              <Code size={10} className="shrink-0" />
                              <span>Mod: {session.module}</span>
                            </div>
                            {hasAlert(session) && (
                              <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md" title="Alerta: Falta profesor o pocos alumnos">
                                <AlertTriangle size={12} />
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Print Preview Modal */}
      <AnimatePresence>
        {showPrintPreview && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm no-print p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-6xl max-h-[90vh] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-950">
                <div>
                  <h2 className="text-xl font-bold">Previsualización de Impresión</h2>
                  <p className="text-sm text-zinc-500">Asegúrate de que la orientación esté en "Horizontal"</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPrintPreview(false)}
                    className="px-6 py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmPrint}
                    className="px-6 py-2 rounded-xl bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <Printer size={18} />
                    Confirmar e Imprimir
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-auto p-8 bg-zinc-100 dark:bg-zinc-950">
                <div className="bg-white p-[1.5cm] shadow-lg mx-auto w-full max-w-[29.7cm] min-h-[21cm] rounded-sm text-zinc-900">
                  {/* Content that will be printed */}
                  <div className="mb-8 pb-6 border-b-4 border-zinc-900 flex justify-between items-end">
                    <div>
                      <h1 className="text-4xl font-black uppercase tracking-tighter text-zinc-900">Horario Académico</h1>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="px-4 py-1 bg-zinc-900 text-white text-lg font-bold rounded-full">
                          {t.days[activeDay]}
                        </span>
                        <span className="text-zinc-400 font-medium">|</span>
                        <span className="text-zinc-500 font-semibold uppercase tracking-widest text-sm">Registro de Clases</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Generado el</div>
                      <div className="text-sm font-black text-zinc-900">{new Date().toLocaleDateString()}</div>
                      <div className="text-xs font-bold text-zinc-500 mt-1">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                  </div>

                  <div className="border-2 border-zinc-900 rounded-lg overflow-hidden">
                    {/* Header Row */}
                    <div 
                      className="grid border-b-2 border-zinc-900 bg-zinc-50"
                      style={{ gridTemplateColumns: `60px repeat(${classrooms.length}, 1fr)` }}
                    >
                      <div className="p-3 text-center text-[10px] font-black uppercase text-zinc-500 border-r-2 border-zinc-900">Hora</div>
                      {classrooms.map((classroom, idx) => (
                        <div 
                          key={classroom.id} 
                          className={`p-3 text-center text-xs font-black uppercase text-zinc-900 ${idx < classrooms.length - 1 ? 'border-r-2 border-zinc-900' : ''}`}
                        >
                          {classroom.name}
                        </div>
                      ))}
                    </div>

                    {/* Grid Body */}
                    <div 
                      className="relative grid h-[11cm] bg-white"
                      style={{ gridTemplateColumns: `60px repeat(${classrooms.length}, 1fr)` }}
                    >
                      {/* Time Column */}
                      <div className="relative border-r-2 border-zinc-900 bg-zinc-50/30">
                        {HOURS.map((hour) => (
                          <div key={hour} className="absolute w-full text-right pr-2 text-[10px] font-black text-zinc-400" style={{ top: `${((hour - 8) / 16) * 100}%`, transform: 'translateY(-50%)' }}>
                            {hour.toString().padStart(2, '0')}:00
                          </div>
                        ))}
                      </div>

                      {/* Classroom Columns */}
                      {classrooms.map((classroom, idx) => (
                        <div 
                          key={classroom.id} 
                          className={`relative ${idx < classrooms.length - 1 ? 'border-r border-zinc-200' : ''}`}
                        >
                          {HOURS.map((hour) => (
                            <div key={hour} className="absolute w-full border-t border-zinc-100" style={{ top: `${((hour - 8) / 16) * 100}%` }} />
                          ))}

                          {activeSessions
                            .filter((s) => s.classroomId === classroom.id)
                            .map((session) => {
                              const course = courses.find((c) => c.id === session.courseId);
                              const color = course?.color || '#3b82f6';
                              return (
                                <div
                                  key={session.id}
                                  className="absolute rounded-md p-2 overflow-hidden border-l-4 shadow-sm flex flex-col justify-between hover:!z-50"
                                  style={{
                                    ...getSessionStyle(session, activeSessions),
                                    backgroundColor: `${color}15`,
                                    borderColor: color,
                                    color: '#000000',
                                    background: `linear-gradient(to right, ${color}15, #ffffff)`,
                                    boxShadow: 'none',
                                    borderWidth: '1px 1px 1px 4px'
                                  }}
                                >
                                  <div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <BookOpen size={10} className="shrink-0 text-zinc-900" />
                                      <div className="text-[10px] font-black leading-tight text-zinc-900 uppercase">{course?.name}</div>
                                    </div>
                                    <div className="flex items-center gap-1 text-[9px] font-bold text-zinc-600 truncate">
                                      <UserIcon size={9} className="shrink-0" />
                                      <span>{session.professor}</span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-zinc-900/10">
                                    <div className="flex items-center gap-1 text-[9px] font-black text-zinc-900">
                                      <Clock size={9} className="shrink-0" />
                                      <span>{session.startTime} - {session.endTime}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-[8px] font-bold text-zinc-500">
                                      <Users size={9} className="shrink-0" />
                                      <span>{session.studentsCount} alumnos</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="mt-6 flex justify-between items-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                    <span>Sistema de Gestión de Horarios</span>
                    <span>Página 1 de 1</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
