import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore, DayOfWeek, Classroom, Course, ClassSession, Professor } from '../store';
import { useTranslation } from '../i18n';
import { Plus, Edit2, Trash2, Save, X, LogOut, Check, Download, Upload, Code, Copy, Printer, Clock, Users, BookOpen, User as UserIcon, AlertTriangle, Search, ChevronDown } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 8); // 8 to 23

export function AdminPage() {
  const { isAdmin, setIsAdmin, language, classrooms, setClassrooms, courses, setCourses, sessions, setSessions, professors, setProfessors, addHistoryLog, historyLogs, loadFromCloud, saveToCloud } = useAppStore();
  const t = useTranslation(language);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState<'sessions' | 'courses' | 'classrooms' | 'professors' | 'data' | 'alerts'>('sessions');
  const [generatedCode, setGeneratedCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeDay, setActiveDay] = useState<DayOfWeek>(() => {
    const day = new Date().getDay();
    return ((day + 6) % 7) as DayOfWeek;
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
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

  const firstLoadRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isAdmin) {
      loadFromCloud().then(() => {
        // After initial load, wait a bit before enabling auto-save
        setTimeout(() => {
          firstLoadRef.current = false;
        }, 1000);
      });
    }
  }, [isAdmin, loadFromCloud]);

  // Auto-save logic
  useEffect(() => {
    if (firstLoadRef.current || !isAdmin) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSyncing(true);
    saveTimeoutRef.current = setTimeout(async () => {
      const success = await saveToCloud(true);
      if (success) {
        setLastSaved(new Date());
      }
      setIsSyncing(false);
    }, 1500); // 1.5 second debounce

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [classrooms, courses, sessions, professors, historyLogs, isAdmin, saveToCloud]);

  // Form states
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [editingProfessor, setEditingProfessor] = useState<Professor | null>(null);
  const [editingSession, setEditingSession] = useState<Partial<ClassSession> | null>(null);
  const [selectedDays, setSelectedDays] = useState<DayOfWeek[]>([]);
  const [dragHoverState, setDragHoverState] = useState<{ classroomId: string, startH: number, startM: number, durationMinutes: number } | null>(null);
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [professorSearch, setProfessorSearch] = useState('');
  const [isProfessorDropdownOpen, setIsProfessorDropdownOpen] = useState(false);
  const [courseSearch, setCourseSearch] = useState('');
  const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);

  const activeSessions = sessions.filter((s) => s.dayOfWeek === activeDay);

  const hasAlert = (session: ClassSession) => {
    return !session.professor || session.professor.trim() === '' || session.studentsCount <= 4;
  };

  const alertSessions = sessions.filter(hasAlert);

  const groupedAlerts = useMemo(() => {
    const groups = new Map();
    alertSessions.forEach(session => {
      const key = session.groupId || `${session.courseId}-${session.classroomId}-${session.startTime}-${session.endTime}-${session.module}`;
      if (groups.has(key)) {
        const existing = groups.get(key);
        if (!existing.daysOfWeek.includes(session.dayOfWeek)) {
          existing.daysOfWeek.push(session.dayOfWeek);
        }
      } else {
        let reasons = [];
        if (!session.professor || session.professor.trim() === '') reasons.push('Falta profesor');
        if (session.studentsCount <= 4) reasons.push('Pocos alumnos');

        groups.set(key, {
          id: key,
          courseId: session.courseId,
          classroomId: session.classroomId,
          professor: session.professor,
          studentsCount: session.studentsCount,
          startTime: session.startTime,
          endTime: session.endTime,
          module: session.module,
          daysOfWeek: [session.dayOfWeek],
          reasons,
          originalSessionId: session.id
        });
      }
    });

    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    return Array.from(groups.values()).sort((a, b) => {
      const aMin = Math.min(...a.daysOfWeek.map((d: string) => dayOrder.indexOf(d)));
      const bMin = Math.min(...b.daysOfWeek.map((d: string) => dayOrder.indexOf(d)));
      return aMin - bMin;
    }).map(group => ({
      ...group,
      daysOfWeek: group.daysOfWeek.sort((a: string, b: string) => dayOrder.indexOf(a) - dayOrder.indexOf(b))
    }));
  }, [alertSessions]);

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

    const isActive = session.isActive !== false;

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
      filter: isActive ? 'none' : 'grayscale(100%) opacity(60%)',
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

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === 'joseph' && password === 'elmaster123') {
      setIsAdmin(true);
      setError('');
    } else {
      setError(t.loginError);
    }
  };

  const handleLogout = () => {
    setIsAdmin(false);
    setUsername('');
    setPassword('');
  };

  // --- Course Handlers ---
  const saveCourse = async () => {
    if (!editingCourse?.name || !editingCourse?.color) return;
    useAppStore.getState().setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    if (editingCourse.id) {
      setCourses(courses.map(c => c.id === editingCourse.id ? editingCourse : c));
    } else {
      setCourses([...courses, { ...editingCourse, id: Date.now().toString() }]);
    }
    setEditingCourse(null);
    useAppStore.getState().setIsLoading(false);
  };

  const deleteCourse = (id: string) => {
    const course = courses.find(c => c.id === id);
    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar Curso',
      message: `¿Estás seguro de que deseas eliminar el curso "${course?.name}"? Esta acción no se puede deshacer y eliminará todas las sesiones asociadas.`,
      onConfirm: () => {
        setCourses(courses.filter(c => c.id !== id));
        setSessions(sessions.filter(s => s.courseId !== id)); // Cascade delete
        setConfirmDialog(null);
      }
    });
  };

  // --- Classroom Handlers ---
  const saveClassroom = async () => {
    if (!editingClassroom?.name) return;
    useAppStore.getState().setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    if (editingClassroom.id) {
      setClassrooms(classrooms.map(c => c.id === editingClassroom.id ? editingClassroom : c));
    } else {
      setClassrooms([...classrooms, { ...editingClassroom, id: Date.now().toString() }]);
    }
    setEditingClassroom(null);
    useAppStore.getState().setIsLoading(false);
  };

  const deleteClassroom = (id: string) => {
    const classroom = classrooms.find(c => c.id === id);
    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar Aula',
      message: `¿Estás seguro de que deseas eliminar el aula "${classroom?.name}"? Esta acción no se puede deshacer y eliminará todas las sesiones asociadas.`,
      onConfirm: () => {
        setClassrooms(classrooms.filter(c => c.id !== id));
        setSessions(sessions.filter(s => s.classroomId !== id)); // Cascade delete
        setConfirmDialog(null);
      }
    });
  };

  // --- Professor Handlers ---
  const saveProfessor = async () => {
    if (!editingProfessor?.name) return;
    useAppStore.getState().setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    if (editingProfessor.id) {
      setProfessors(professors.map(p => p.id === editingProfessor.id ? editingProfessor : p));
    } else {
      setProfessors([...professors, { ...editingProfessor, id: Date.now().toString() }]);
    }
    setEditingProfessor(null);
    useAppStore.getState().setIsLoading(false);
  };

  const deleteProfessor = (id: string) => {
    const professor = professors.find(p => p.id === id);
    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar Profesor',
      message: `¿Estás seguro de que deseas eliminar al profesor "${professor?.name}"? Esta acción no se puede deshacer.`,
      onConfirm: () => {
        setProfessors(professors.filter(p => p.id !== id));
        setConfirmDialog(null);
      }
    });
  };

  // --- Session Handlers ---
  const saveSession = async () => {
    if (!editingSession?.courseId || !editingSession?.classroomId || !editingSession?.startTime || !editingSession?.endTime) return;
    
    // Validate time format
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(editingSession.startTime) || !timeRegex.test(editingSession.endTime)) {
      alert(t.timeFormatError);
      return;
    }

    const [startH, startM] = editingSession.startTime.split(':').map(Number);
    const [endH, endM] = editingSession.endTime.split(':').map(Number);
    
    if (startH < 8 || endH > 23 || (endH === 23 && endM > 0)) {
      alert(t.timeRangeError);
      return;
    }

    if (startH * 60 + startM >= endH * 60 + endM) {
      alert(t.endTimeError);
      return;
    }

    useAppStore.getState().setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500)); // Fake loading

    const newGroupId = editingSession.groupId || (selectedDays.length > 1 ? Date.now().toString() : undefined);

    if (editingSession.id) {
      if (selectedDays.length === 0) {
        alert('Please select at least one day');
        useAppStore.getState().setIsLoading(false);
        return;
      }

      // If it was part of a group, remove all sessions in that group first
      let remainingSessions = sessions;
      if (editingSession.groupId) {
        remainingSessions = sessions.filter(s => s.groupId !== editingSession.groupId);
      } else {
        remainingSessions = sessions.filter(s => s.id !== editingSession.id);
      }

      // Create new sessions for all selected days
      const newSessions: ClassSession[] = selectedDays.map(day => ({
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        courseId: editingSession.courseId!,
        professor: editingSession.professor || '',
        startTime: editingSession.startTime!,
        endTime: editingSession.endTime!,
        module: editingSession.module || '',
        studentsCount: editingSession.studentsCount || 0,
        classroomId: editingSession.classroomId!,
        dayOfWeek: day,
        groupId: selectedDays.length > 1 ? newGroupId : undefined,
        isActive: editingSession.isActive !== false,
      }));

      setSessions([...remainingSessions, ...newSessions]);
      const course = courses.find(c => c.id === editingSession.courseId);
      addHistoryLog({
        action: 'edit',
        courseName: course?.name || 'Curso',
        description: `Horario editado: ${editingSession.startTime} - ${editingSession.endTime}`
      });
    } else {
      // Creating new session(s)
      if (selectedDays.length === 0) {
        alert('Please select at least one day');
        useAppStore.getState().setIsLoading(false);
        return;
      }
      
      const newSessions: ClassSession[] = selectedDays.map(day => ({
        id: Date.now().toString() + Math.random().toString(36).substring(7),
        courseId: editingSession.courseId!,
        professor: editingSession.professor || '',
        startTime: editingSession.startTime!,
        endTime: editingSession.endTime!,
        module: editingSession.module || '',
        studentsCount: editingSession.studentsCount || 0,
        classroomId: editingSession.classroomId!,
        dayOfWeek: day,
        groupId: selectedDays.length > 1 ? newGroupId : undefined,
        isActive: editingSession.isActive !== false,
      }));
      
      setSessions([...sessions, ...newSessions]);
      const course = courses.find(c => c.id === editingSession.courseId);
      addHistoryLog({
        action: 'add',
        courseName: course?.name || 'Curso',
        description: `Nuevo horario agregado: ${editingSession.startTime} - ${editingSession.endTime}`
      });
    }
    setEditingSession(null);
    setSelectedDays([]);
    useAppStore.getState().setIsLoading(false);
  };

  const deleteSession = (id: string) => {
    const session = sessions.find(s => s.id === id);
    const course = courses.find(c => c.id === session?.courseId);
    
    setConfirmDialog({
      isOpen: true,
      title: 'Eliminar Horario',
      message: session?.groupId 
        ? `¿Estás seguro de que deseas eliminar este horario de "${course?.name}"? Como es parte de un grupo, se eliminarán todos los horarios de este grupo en los diferentes días.`
        : `¿Estás seguro de que deseas eliminar este horario de "${course?.name}"? Esta acción no se puede deshacer.`,
      onConfirm: () => {
        if (session?.groupId) {
          setSessions(sessions.filter(s => s.groupId !== session.groupId));
        } else {
          setSessions(sessions.filter(s => s.id !== id));
        }
        addHistoryLog({
          action: 'delete',
          courseName: course?.name || 'Curso',
          description: `Horario eliminado: ${session?.startTime} - ${session?.endTime}`
        });
        setConfirmDialog(null);
      }
    });
  };

  // --- Drag and Drop Handlers ---
  const handleDragStart = (e: React.DragEvent, sessionId: string) => {
    e.dataTransfer.setData('sessionId', sessionId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedSessionId(sessionId);
  };

  const handleDragEnd = () => {
    setDraggedSessionId(null);
    setDragHoverState(null);
  };

  const handleDragOverClassroom = (e: React.DragEvent, classroomId: string) => {
    e.preventDefault();
    if (!draggedSessionId) return;

    const session = sessions.find(s => s.id === draggedSessionId);
    if (!session) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    // Total minutes in the grid (16 hours * 60)
    const totalMinutes = (y / height) * (16 * 60);
    let startH = Math.round(totalMinutes / 60) + 8;
    let startM = 0; // Snap to exact hours only

    if (startH > 23) startH = 23;
    if (startH < 8) startH = 8;

    const [oldStartH, oldStartM] = session.startTime.split(':').map(Number);
    const [oldEndH, oldEndM] = session.endTime.split(':').map(Number);
    const durationMinutes = (oldEndH * 60 + oldEndM) - (oldStartH * 60 + oldStartM);

    setDragHoverState({
      classroomId,
      startH,
      startM,
      durationMinutes
    });
  };

  const handleDragLeaveClassroom = (e: React.DragEvent) => {
    // We don't clear it immediately to avoid flickering when moving between elements inside the classroom column
    // It will be cleared on drop or dragEnd
  };

  const handleDropOnDay = (e: React.DragEvent, dayIndex: number) => {
    e.preventDefault();
    setDragHoverState(null);
    setDraggedSessionId(null);
    const sessionId = e.dataTransfer.getData('sessionId');
    if (!sessionId) return;

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    if (session.groupId) {
      // If it's a group, we just move the specific instance to the new day
      // But wait, if the new day is already in the group, we might have a conflict
      // For simplicity, let's just move the one instance
      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, dayOfWeek: dayIndex as DayOfWeek } : s
      ));
    } else {
      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, dayOfWeek: dayIndex as DayOfWeek } : s
      ));
    }
  };

  const handleDropOnClassroom = (e: React.DragEvent, classroomId: string) => {
    e.preventDefault();
    setDragHoverState(null);
    setDraggedSessionId(null);
    const sessionId = e.dataTransfer.getData('sessionId');
    if (!sessionId) return;

    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    // Calculate new time based on drop position
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;
    
    // Total minutes in the grid (16 hours * 60)
    const totalMinutes = (y / height) * (16 * 60);
    let startH = Math.round(totalMinutes / 60) + 8;
    let startM = 0; // Snap to exact hours only

    if (startH > 23) startH = 23;
    if (startH < 8) startH = 8;

    const startTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
    
    // Keep the same duration
    const [oldStartH, oldStartM] = session.startTime.split(':').map(Number);
    const [oldEndH, oldEndM] = session.endTime.split(':').map(Number);
    const durationMinutes = (oldEndH * 60 + oldEndM) - (oldStartH * 60 + oldStartM);
    
    const newStartTotal = startH * 60 + startM;
    const newEndTotal = newStartTotal + durationMinutes;
    
    let endH = Math.floor(newEndTotal / 60);
    let endM = newEndTotal % 60;
    
    if (endH > 23 && endM > 0) {
      endH = 23;
      endM = 0;
    }
    
    const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    if (session.groupId) {
      // Update all sessions in the group with the new time and classroom
      setSessions(sessions.map(s => 
        s.groupId === session.groupId ? { ...s, classroomId, startTime, endTime } : s
      ));
    } else {
      setSessions(sessions.map(s => 
        s.id === sessionId ? { ...s, classroomId, startTime, endTime } : s
      ));
    }
  };

  // --- Data Handlers ---
  const handleExportAlertsToCSV = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Alertas de Horarios');

    // Define columns
    worksheet.columns = [
      { header: 'Curso', key: 'course', width: 30 },
      { header: 'Módulo', key: 'module', width: 15 },
      { header: 'Días', key: 'days', width: 25 },
      { header: 'Horario', key: 'time', width: 20 },
      { header: 'Aula', key: 'classroom', width: 20 },
      { header: 'Profesor', key: 'professor', width: 30 },
      { header: 'Alumnos', key: 'students', width: 15 },
      { header: 'Motivo de Alerta', key: 'reasons', width: 35 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3F3F46' } // zinc-700
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 30;

    // Add data rows
    groupedAlerts.forEach(group => {
      const course = courses.find(c => c.id === group.courseId)?.name || 'Desconocido';
      const days = group.daysOfWeek.map((d: DayOfWeek) => t.days[d]).join(', ');
      const classroom = classrooms.find(c => c.id === group.classroomId)?.name || 'Desconocida';
      const professor = group.professor || 'Sin asignar';
      
      const row = worksheet.addRow({
        course: course,
        module: group.module || '-',
        days: days,
        time: `${group.startTime} - ${group.endTime}`,
        classroom: classroom,
        professor: professor,
        students: group.studentsCount,
        reasons: group.reasons.join(' y ')
      });

      // Style row
      row.alignment = { vertical: 'middle', wrapText: true };
      
      // Highlight specific cells based on alerts
      if (!group.professor) {
        row.getCell('professor').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' } // red-100
        };
        row.getCell('professor').font = { color: { argb: 'FFB91C1C' }, bold: true }; // red-700
      }

      if (group.studentsCount <= 4) {
        row.getCell('students').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEE2E2' } // red-100
        };
        row.getCell('students').font = { color: { argb: 'FFB91C1C' }, bold: true }; // red-700
      } else {
        row.getCell('students').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1FAE5' } // emerald-100
        };
        row.getCell('students').font = { color: { argb: 'FF047857' }, bold: true }; // emerald-700
      }

      row.getCell('reasons').font = { color: { argb: 'FFDC2626' }, bold: true }; // red-600
    });

    // Add borders to all cells
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE4E4E7' } },
          left: { style: 'thin', color: { argb: 'FFE4E4E7' } },
          bottom: { style: 'thin', color: { argb: 'FFE4E4E7' } },
          right: { style: 'thin', color: { argb: 'FFE4E4E7' } }
        };
      });
    });

    // Generate and save file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'horarios-en-alerta.xlsx');
  };

  const handleExportScheduleToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    
    // Create a sheet for each day
    const days: DayOfWeek[] = [0, 1, 2, 3, 4, 5];
    
    days.forEach(day => {
      const worksheet = workbook.addWorksheet(t.days[day]);
      
      // Define columns: Time + Classrooms
      const columns = [
        { header: 'Hora', key: 'time', width: 15 },
        ...classrooms.map(c => ({ header: c.name, key: c.id, width: 25 }))
      ];
      worksheet.columns = columns;

      // Style header row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F46E5' } // indigo-600
      };
      headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
      headerRow.height = 30;

      // Add rows for each hour block (e.g., 8:00 - 10:00)
      for (let hour = 8; hour <= 22; hour += 2) {
        const timeString = `${hour.toString().padStart(2, '0')}:00 - ${(hour + 2).toString().padStart(2, '0')}:00`;
        const rowData: any = { time: timeString };
        
        classrooms.forEach(classroom => {
          // Find all sessions for this day, classroom, and time
          const activeSessionsForBlock = sessions.filter(s => {
            if (s.dayOfWeek !== day || s.classroomId !== classroom.id) return false;
            if (s.isActive === false) return false; // Don't export inactive sessions
            const startH = parseInt(s.startTime.split(':')[0]);
            const startM = parseInt(s.startTime.split(':')[1]);
            const endH = parseInt(s.endTime.split(':')[0]);
            const endM = parseInt(s.endTime.split(':')[1]);
            
            const sessionStart = startH + startM / 60;
            const sessionEnd = endH + endM / 60;
            const blockStart = hour;
            const blockEnd = hour + 2;
            
            return sessionStart < blockEnd && sessionEnd > blockStart;
          });
          
          if (activeSessionsForBlock.length > 0) {
            rowData[classroom.id] = activeSessionsForBlock.map(session => {
              const course = courses.find(c => c.id === session.courseId);
              return `${course?.name || 'Desconocido'}\nProf: ${session.professor || 'Sin asignar'}\nAlumnos: ${session.studentsCount}`;
            }).join('\n\n---\n\n');
          } else {
            rowData[classroom.id] = '';
          }
        });
        
        const row = worksheet.addRow(rowData);
        row.height = 60; // Make rows taller to fit multiple lines
        row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        
        // Style time column
        row.getCell('time').font = { bold: true };
        row.getCell('time').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF4F4F5' } // zinc-100
        };
        
        // Style session cells
        classrooms.forEach(classroom => {
          const cell = row.getCell(classroom.id);
          if (cell.value) {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFE0E7FF' } // indigo-100
            };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFC7D2FE' } },
              left: { style: 'thin', color: { argb: 'FFC7D2FE' } },
              bottom: { style: 'thin', color: { argb: 'FFC7D2FE' } },
              right: { style: 'thin', color: { argb: 'FFC7D2FE' } }
            };
          } else {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE4E4E7' } },
              left: { style: 'thin', color: { argb: 'FFE4E4E7' } },
              bottom: { style: 'thin', color: { argb: 'FFE4E4E7' } },
              right: { style: 'thin', color: { argb: 'FFE4E4E7' } }
            };
          }
        });
      }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'horario-completo.xlsx');
  };

  const handleExport = () => {
    const data = { classrooms, courses, sessions, professors };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'horario-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.classrooms) setClassrooms(data.classrooms);
        if (data.courses) setCourses(data.courses);
        if (data.sessions) setSessions(data.sessions);
        if (data.professors) setProfessors(data.professors);
        alert('Datos importados correctamente');
      } catch (error) {
        alert('Error al importar el archivo JSON');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleGenerateCode = () => {
    const code = `const defaultClassrooms: Classroom[] = ${JSON.stringify(classrooms, null, 2)};\n\nconst defaultCourses: Course[] = ${JSON.stringify(courses, null, 2)};\n\nconst defaultSessions: ClassSession[] = ${JSON.stringify(sessions, null, 2)};\n\nconst defaultProfessors: Professor[] = ${JSON.stringify(professors, null, 2)};`;
    setGeneratedCode(code);
    setCopied(false);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-zinc-50 dark:bg-zinc-950">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-xl p-8 border border-zinc-200 dark:border-zinc-800"
        >
          <h2 className="text-3xl font-bold text-center mb-8 text-zinc-900 dark:text-zinc-100">{t.admin}</h2>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{t.username}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0 transition-colors text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">{t.password}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0 transition-colors text-zinc-900 dark:text-zinc-100"
                required
              />
            </div>
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-md hover:shadow-lg"
            >
              {t.login}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 font-sans">
          {t.admin} Dashboard
        </h1>
        <div className="flex items-center gap-4">
          {nextEvent && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-amber-700 dark:text-amber-400 no-print">
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
            className="flex items-center gap-2 px-4 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium no-print"
          >
            <Printer size={18} />
            Imprimir
          </button>
          <div className="flex flex-col items-end no-print">
            <div className="flex items-center gap-2 text-sm font-medium">
              {isSyncing ? (
                <>
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                  <span className="text-amber-600 dark:text-amber-400">Sincronizando...</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                  <span className="text-emerald-600 dark:text-emerald-400">Sincronizado</span>
                </>
              )}
            </div>
            {lastSaved && (
              <span className="text-[10px] text-zinc-500">
                Último guardado: {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors font-medium"
          >
            <LogOut size={18} />
            {t.logout}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-8 border-b border-zinc-200 dark:border-zinc-800 pb-4 overflow-x-auto hide-scrollbar">
        {(['sessions', 'courses', 'classrooms', 'professors', 'data', 'alerts'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === tab
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
            }`}
          >
            {t[tab]}
            {tab === 'alerts' && groupedAlerts.length > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {groupedAlerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {/* --- COURSES TAB --- */}
          {activeTab === 'courses' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold">{t.courses}</h2>
                <button
                  onClick={() => setEditingCourse({ id: '', name: '', color: '#3b82f6' })}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={18} /> {t.add}
                </button>
              </div>

              {editingCourse && (
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-2">{t.name}</label>
                    <input
                      type="text"
                      value={editingCourse.name}
                      onChange={(e) => setEditingCourse({ ...editingCourse, name: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">{t.color}</label>
                    <input
                      type="color"
                      value={editingCourse.color}
                      onChange={(e) => setEditingCourse({ ...editingCourse, color: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer border-0 p-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveCourse} className="p-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors">
                      <Save size={20} />
                    </button>
                    <button onClick={() => setEditingCourse(null)} className="p-2.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {courses.map(course => (
                  <div key={course.id} className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex justify-between items-center group">
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: course.color }} />
                      <span className="font-medium">{course.name}</span>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingCourse(course)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteCourse(course.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {courses.length === 0 && <p className="text-zinc-500 col-span-full">{t.noCourses}</p>}
              </div>
            </div>
          )}

          {/* --- CLASSROOMS TAB --- */}
          {activeTab === 'classrooms' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold">{t.classrooms}</h2>
                <button
                  onClick={() => setEditingClassroom({ id: '', name: '' })}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={18} /> {t.add}
                </button>
              </div>

              {editingClassroom && (
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-2">{t.name}</label>
                    <input
                      type="text"
                      value={editingClassroom.name}
                      onChange={(e) => setEditingClassroom({ ...editingClassroom, name: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveClassroom} className="p-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors">
                      <Save size={20} />
                    </button>
                    <button onClick={() => setEditingClassroom(null)} className="p-2.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {classrooms.map(classroom => (
                  <div key={classroom.id} className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex justify-between items-center group">
                    <span className="font-medium">{classroom.name}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingClassroom(classroom)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteClassroom(classroom.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- PROFESSORS TAB --- */}
          {activeTab === 'professors' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold">{t.professors}</h2>
                <button
                  onClick={() => setEditingProfessor({ id: '', name: '' })}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={18} /> {t.add}
                </button>
              </div>

              {editingProfessor && (
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-sm font-medium mb-2">{t.name}</label>
                    <input
                      type="text"
                      value={editingProfessor.name}
                      onChange={(e) => setEditingProfessor({ ...editingProfessor, name: e.target.value })}
                      className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveProfessor} className="p-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-600 transition-colors">
                      <Save size={20} />
                    </button>
                    <button onClick={() => setEditingProfessor(null)} className="p-2.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors">
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {professors.map(professor => (
                  <div key={professor.id} className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 flex justify-between items-center group">
                    <span className="font-medium">{professor.name}</span>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingProfessor(professor)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteProfessor(professor.id)} className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {professors.length === 0 && <p className="text-zinc-500 col-span-full">{t.noProfessors}</p>}
              </div>
            </div>
          )}

          {/* --- SESSIONS TAB --- */}
          {activeTab === 'sessions' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h2 className="text-2xl font-semibold">{t.sessions}</h2>
                <button
                  onClick={() => {
                    setEditingSession({
                      courseId: courses[0]?.id || '',
                      classroomId: classrooms[0]?.id || '',
                      startTime: '08:00',
                      endTime: '10:00',
                      professor: '',
                      module: '',
                      studentsCount: 0,
                    });
                    setSelectedDays([]);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={18} /> {t.add}
                </button>
              </div>

              {editingSession && (
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="relative">
                      <label className="block text-sm font-medium mb-2">{t.course}</label>
                      <div 
                        className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus-within:border-indigo-500 focus-within:bg-white dark:focus-within:bg-zinc-950 flex items-center justify-between cursor-pointer"
                        onClick={() => setIsCourseDropdownOpen(!isCourseDropdownOpen)}
                      >
                        <span className={editingSession.courseId ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}>
                          {courses.find(c => c.id === editingSession.courseId)?.name || 'Seleccionar curso...'}
                        </span>
                        <ChevronDown size={16} className="text-zinc-500" />
                      </div>
                      
                      {isCourseDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-40"
                            onClick={() => setIsCourseDropdownOpen(false)}
                          />
                          <div className="absolute z-50 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden">
                            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                              <Search size={16} className="text-zinc-400 shrink-0" />
                              <input
                                type="text"
                                placeholder="Buscar curso..."
                                value={courseSearch}
                                onChange={(e) => setCourseSearch(e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 text-sm p-1 outline-none"
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto p-1 relative z-50">
                              {courses
                                .filter(c => c.name.toLowerCase().includes(courseSearch.toLowerCase()))
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(c => (
                                  <div
                                    key={c.id}
                                    className="px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer text-sm"
                                    onClick={() => {
                                      setEditingSession({ ...editingSession, courseId: c.id });
                                      setIsCourseDropdownOpen(false);
                                      setCourseSearch('');
                                    }}
                                  >
                                    {c.name}
                                  </div>
                                ))}
                              {courses.filter(c => c.name.toLowerCase().includes(courseSearch.toLowerCase())).length === 0 && (
                                <div className="px-3 py-2 text-sm text-zinc-500 text-center">
                                  No se encontraron cursos
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">{t.classroom}</label>
                      <select
                        value={editingSession.classroomId}
                        onChange={(e) => setEditingSession({ ...editingSession, classroomId: e.target.value })}
                        className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                      >
                        <option value="">Seleccionar aula...</option>
                        {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="relative">
                      <label className="block text-sm font-medium mb-2">{t.professor}</label>
                      <div 
                        className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus-within:border-indigo-500 focus-within:bg-white dark:focus-within:bg-zinc-950 flex items-center justify-between cursor-pointer"
                        onClick={() => setIsProfessorDropdownOpen(!isProfessorDropdownOpen)}
                      >
                        <span className={editingSession.professor ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500'}>
                          {editingSession.professor || 'Seleccionar profesor...'}
                        </span>
                        <ChevronDown size={16} className="text-zinc-500" />
                      </div>
                      
                      {isProfessorDropdownOpen && (
                        <>
                          <div 
                            className="fixed inset-0 z-40"
                            onClick={() => setIsProfessorDropdownOpen(false)}
                          />
                          <div className="absolute z-50 w-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden">
                            <div className="p-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                              <Search size={16} className="text-zinc-400 shrink-0" />
                              <input
                                type="text"
                                placeholder="Buscar profesor..."
                                value={professorSearch}
                                onChange={(e) => setProfessorSearch(e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 text-sm p-1 outline-none"
                                onClick={(e) => e.stopPropagation()}
                                autoFocus
                              />
                            </div>
                            <div className="max-h-48 overflow-y-auto p-1 relative z-50">
                              <div 
                                className="px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer text-sm text-zinc-500"
                                onClick={() => {
                                  setEditingSession({ ...editingSession, professor: '' });
                                  setIsProfessorDropdownOpen(false);
                                  setProfessorSearch('');
                                }}
                              >
                                Sin asignar
                              </div>
                              {professors
                                .filter(p => p.name.toLowerCase().includes(professorSearch.toLowerCase()))
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .map(p => (
                                  <div
                                    key={p.id}
                                    className="px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg cursor-pointer text-sm"
                                    onClick={() => {
                                      setEditingSession({ ...editingSession, professor: p.name });
                                      setIsProfessorDropdownOpen(false);
                                      setProfessorSearch('');
                                    }}
                                  >
                                    {p.name}
                                  </div>
                                ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">{t.startTime}</label>
                        <input
                          type="time"
                          value={editingSession.startTime}
                          onChange={(e) => setEditingSession({ ...editingSession, startTime: e.target.value })}
                          className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">{t.endTime}</label>
                        <input
                          type="time"
                          value={editingSession.endTime}
                          onChange={(e) => setEditingSession({ ...editingSession, endTime: e.target.value })}
                          className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">{t.module}</label>
                        <input
                          type="text"
                          value={editingSession.module}
                          onChange={(e) => setEditingSession({ ...editingSession, module: e.target.value })}
                          className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">{t.studentsCount}</label>
                        <input
                          type="number"
                          value={editingSession.studentsCount}
                          onChange={(e) => setEditingSession({ ...editingSession, studentsCount: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-zinc-950 focus:ring-0"
                        />
                      </div>
                      <div className="flex items-center gap-3 mt-8">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={editingSession.isActive !== false}
                            onChange={(e) => setEditingSession({ ...editingSession, isActive: e.target.checked })}
                          />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 dark:peer-focus:ring-indigo-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                          <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-300">
                            {editingSession.isActive !== false ? 'Horario Activo' : 'Horario Inactivo'}
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      {t.dayOfWeek} <span className="text-zinc-500 font-normal">({t.selectMultipleDays})</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {t.days.map((day, index) => {
                        const isSelected = selectedDays.includes(index as DayOfWeek);
                        
                        return (
                          <button
                            key={index}
                            onClick={() => {
                              if (selectedDays.includes(index as DayOfWeek)) {
                                setSelectedDays(selectedDays.filter(d => d !== index));
                              } else {
                                setSelectedDays([...selectedDays, index as DayOfWeek]);
                              }
                            }}
                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                              isSelected
                                ? 'bg-indigo-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            }`}
                          >
                            {isSelected && <Check size={14} />}
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <button onClick={() => setEditingSession(null)} className="px-6 py-2 rounded-xl font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                      {t.cancel}
                    </button>
                    <button onClick={saveSession} className="px-6 py-2 rounded-xl font-medium bg-emerald-500 hover:bg-emerald-600 text-white transition-colors shadow-sm">
                      {t.save}
                    </button>
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex overflow-x-auto gap-2 hide-scrollbar">
                  {t.days.map((day, index) => (
                    <button
                      key={index}
                      onClick={() => setActiveDay(index as DayOfWeek)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleDropOnDay(e, index)}
                      className={`px-4 py-2 rounded-xl font-medium text-sm whitespace-nowrap transition-all border-2 ${
                        activeDay === index
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm border-transparent'
                          : index === todayIndex
                            ? 'bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 border-amber-500 dark:border-amber-500'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 border-transparent'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
                
                <div className="overflow-x-auto">
                  <div className="min-w-[800px]">
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
                    <div className="relative grid grid-cols-[80px_repeat(6,1fr)] bg-white dark:bg-zinc-900 h-[800px] print-grid">
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
                      {classrooms.map((classroom) => (
                        <div 
                          key={classroom.id} 
                          className="relative border-r border-zinc-200 dark:border-zinc-800 last:border-r-0"
                          onDragOver={(e) => handleDragOverClassroom(e, classroom.id)}
                          onDragLeave={handleDragLeaveClassroom}
                          onDrop={(e) => handleDropOnClassroom(e, classroom.id)}
                        >
                          {/* Horizontal Grid Lines */}
                          {HOURS.map((hour) => (
                            <div key={hour} className="absolute w-full border-t border-zinc-100 dark:border-zinc-800/50" style={{ top: `${((hour - 8) / 16) * 100}%` }} />
                          ))}

                          {/* Clickable Empty Slots */}
                          {HOURS.map((hour) => (
                            <div
                              key={`slot-${hour}`}
                              className="absolute w-full h-[6.25%] hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20 cursor-pointer group transition-colors z-0"
                              style={{ top: `${((hour - 8) / 16) * 100}%` }}
                              onClick={() => {
                                setEditingSession({
                                  courseId: courses[0]?.id || '',
                                  classroomId: classroom.id,
                                  startTime: `${hour.toString().padStart(2, '0')}:00`,
                                  endTime: `${(hour + 2).toString().padStart(2, '0')}:00`,
                                  professor: '',
                                  module: '',
                                  studentsCount: 0,
                                });
                                setSelectedDays([activeDay]);
                                
                                // Scroll to top to see the form
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                            >
                              <div className="hidden group-hover:flex absolute inset-0 items-center justify-center text-indigo-600 dark:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus size={24} />
                              </div>
                            </div>
                          ))}

                          {/* Drag Hover Placeholder */}
                          {dragHoverState && dragHoverState.classroomId === classroom.id && (
                            <div 
                              className="absolute left-1 right-1 rounded-xl border-2 border-dashed border-indigo-500 bg-indigo-500/10 z-0 pointer-events-none transition-all duration-150"
                              style={{
                                top: `${((dragHoverState.startH - 8) * 60 + dragHoverState.startM) / (16 * 60) * 100}%`,
                                height: `${dragHoverState.durationMinutes / (16 * 60) * 100}%`
                              }}
                            />
                          )}

                          {/* Sessions */}
                          <AnimatePresence>
                            {activeSessions
                              .filter((s) => s.classroomId === classroom.id)
                              .map((session) => {
                                const course = courses.find((c) => c.id === session.courseId);
                                return (
                                  <motion.div
                                    key={session.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e as any, session.id)}
                                    onDragEnd={handleDragEnd}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.9 }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                    className="absolute rounded-xl p-2 overflow-hidden transition-all hover:!z-50 hover:scale-[1.02] cursor-pointer group"
                                    style={getSessionStyle(session, activeSessions)}
                                    onClick={() => {
                                      setEditingSession(session);
                                      if (session.groupId) {
                                        const groupDays = sessions
                                          .filter(s => s.groupId === session.groupId)
                                          .map(s => s.dayOfWeek);
                                        setSelectedDays(groupDays);
                                      } else {
                                        setSelectedDays([session.dayOfWeek]);
                                      }
                                    }}
                                  >
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
                                      <div className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md transition-opacity group-hover:opacity-0" title="Alerta: Falta profesor o pocos alumnos">
                                        <AlertTriangle size={12} />
                                      </div>
                                    )}
                                    <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteSession(session.id);
                                        }}
                                        className="p-1 bg-red-500 text-white rounded-md hover:bg-red-600"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
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
            </div>
          )}

          {/* --- ALERTS TAB --- */}
          {activeTab === 'alerts' && (
            <div className="space-y-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-semibold mb-2">{t.alerts || 'Alertas'}</h2>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    Horarios que requieren atención (sin profesor asignado o con 4 alumnos o menos).
                  </p>
                </div>
                <button
                  onClick={handleExportAlertsToCSV}
                  disabled={groupedAlerts.length === 0}
                  className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={20} /> Exportar a Excel
                </button>
              </div>

              {groupedAlerts.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 p-12 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 text-center">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check size={32} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-zinc-900 dark:text-zinc-100">¡Todo en orden!</h3>
                  <p className="text-zinc-500">No hay horarios con alertas en este momento.</p>
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
                          <th className="p-4 font-semibold text-sm text-zinc-600 dark:text-zinc-400">Curso</th>
                          <th className="p-4 font-semibold text-sm text-zinc-600 dark:text-zinc-400">Días y Hora</th>
                          <th className="p-4 font-semibold text-sm text-zinc-600 dark:text-zinc-400">Aula</th>
                          <th className="p-4 font-semibold text-sm text-zinc-600 dark:text-zinc-400">Profesor</th>
                          <th className="p-4 font-semibold text-sm text-zinc-600 dark:text-zinc-400">Alumnos</th>
                          <th className="p-4 font-semibold text-sm text-zinc-600 dark:text-zinc-400">Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupedAlerts.map(group => {
                          const course = courses.find(c => c.id === group.courseId);
                          const classroom = classrooms.find(c => c.id === group.classroomId);
                          const daysText = group.daysOfWeek.map((d: DayOfWeek) => t.days[d]).join(', ');

                          return (
                            <tr key={group.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                              <td className="p-4">
                                <div className="font-medium text-zinc-900 dark:text-zinc-100">{course?.name || 'Desconocido'}</div>
                                <div className="text-xs text-zinc-500">Módulo: {group.module}</div>
                              </td>
                              <td className="p-4">
                                <div className="font-medium text-zinc-900 dark:text-zinc-100">{daysText}</div>
                                <div className="text-xs text-zinc-500">{group.startTime} - {group.endTime}</div>
                              </td>
                              <td className="p-4 text-zinc-700 dark:text-zinc-300">{classroom?.name || 'Desconocida'}</td>
                              <td className="p-4">
                                {group.professor ? (
                                  <span className="text-zinc-700 dark:text-zinc-300">{group.professor}</span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium">
                                    Sin asignar
                                  </span>
                                )}
                              </td>
                              <td className="p-4">
                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${group.studentsCount <= 4 ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'}`}>
                                  {group.studentsCount}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex flex-col gap-1">
                                  {group.reasons.map((r: string, i: number) => (
                                    <span key={i} className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                                      <AlertTriangle size={12} /> {r}
                                    </span>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* --- DATA TAB --- */}
          {activeTab === 'data' && (
            <div className="space-y-8">
              <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                <div className="bg-emerald-50 dark:bg-emerald-900/20 p-6 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 mb-8">
                  <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-300 mb-2 flex items-center gap-2">
                    <Save size={20} /> Sincronización en Tiempo Real Activa
                  </h3>
                  <p className="text-emerald-700 dark:text-emerald-400 text-sm">
                    Cualquier cambio que realices en el horario, aulas, cursos o profesores se guarda automáticamente en la nube (Supabase) después de 1.5 segundos de inactividad. Ya no necesitas guardar manualmente.
                  </p>
                </div>

                <h2 className="text-2xl font-semibold mb-2">{t.data}</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl">
                  Utiliza estas herramientas para respaldar tus datos localmente o importar configuraciones previas.
                </p>

                <div className="flex flex-wrap gap-4 mb-8">
                  <button
                    onClick={handleExportScheduleToExcel}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm"
                  >
                    <Download size={20} /> Exportar Horario a Excel
                  </button>
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium"
                  >
                    <Download size={20} /> Respaldar Datos (JSON)
                  </button>
                  
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImport}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-6 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium"
                  >
                    <Upload size={20} /> {t.importData}
                  </button>

                  <button
                    onClick={handleGenerateCode}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm"
                  >
                    <Code size={20} /> {t.generateCode}
                  </button>
                </div>

                {generatedCode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-4"
                  >
                    <div className="flex justify-between items-center">
                      <h3 className="font-medium text-zinc-900 dark:text-zinc-100">Código generado:</h3>
                      <button
                        onClick={handleCopyCode}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium"
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                        {copied ? '¡Copiado!' : t.copyCode}
                      </button>
                    </div>
                    <div className="relative">
                      <pre className="p-6 bg-zinc-950 text-zinc-300 rounded-2xl overflow-x-auto text-sm font-mono border border-zinc-800 shadow-inner max-h-[400px] overflow-y-auto">
                        <code>{generatedCode}</code>
                      </pre>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* History Log Section */}
              <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl shadow-sm border border-zinc-200 dark:border-zinc-800">
                <h2 className="text-2xl font-semibold mb-2">Historial de Cambios</h2>
                <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-2xl">
                  Últimos 10 cambios realizados en los horarios.
                </p>
                
                {historyLogs && historyLogs.length > 0 ? (
                  <div className="space-y-4">
                    {historyLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-4 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
                        <div className={`p-2 rounded-xl shrink-0 ${
                          log.action === 'add' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          log.action === 'edit' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                          'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                          {log.action === 'add' ? <Plus size={18} /> : log.action === 'edit' ? <Edit2 size={18} /> : <Trash2 size={18} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">{log.courseName}</h4>
                            <span className="text-xs text-zinc-500 whitespace-nowrap">
                              {new Date(log.date).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400">{log.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                    No hay cambios recientes registrados.
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
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
                      <h1 className="text-4xl font-black uppercase tracking-tighter text-zinc-900">Horario Académico - Administración</h1>
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
                                    ...getSessionStyle(session, sessions.filter(s => s.dayOfWeek === activeDay)),
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

        {confirmDialog && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center gap-4 mb-6 text-red-600 dark:text-red-400">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
                  <AlertTriangle size={24} />
                </div>
                <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{confirmDialog.title}</h3>
              </div>
              <p className="text-zinc-600 dark:text-zinc-400 mb-8 leading-relaxed">
                {confirmDialog.message}
              </p>
              <div className="flex gap-4 justify-end">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="px-6 py-3 rounded-xl font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className="px-6 py-3 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 transition-colors shadow-sm"
                >
                  Eliminar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
