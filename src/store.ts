import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClient } from '@supabase/supabase-js';
import defaultData from './data.json';

// Supabase Client (Optional)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = (supabaseUrl && supabaseAnonKey) ? createClient(supabaseUrl, supabaseAnonKey) : null;

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Lunes, 6 = Domingo

export interface Classroom {
  id: string;
  name: string;
}

export interface Professor {
  id: string;
  name: string;
}

export interface Course {
  id: string;
  name: string;
  color: string;
}

export interface ClassSession {
  id: string;
  courseId: string;
  professor: string;
  startTime: string; // "08:00"
  endTime: string;   // "10:00"
  module: string;
  studentsCount: number;
  classroomId: string;
  dayOfWeek: DayOfWeek;
  groupId?: string;
  isActive?: boolean; // Controls if the session is active/visible in public view
}

export interface HistoryLog {
  id: string;
  action: 'add' | 'edit' | 'delete' | 'toggle';
  courseName: string;
  description: string;
  date: string; // ISO string
}

interface AppState {
  classrooms: Classroom[];
  courses: Course[];
  sessions: ClassSession[];
  professors: Professor[];
  historyLogs: HistoryLog[];
  theme: 'light' | 'dark';
  language: 'es' | 'en';
  isAdmin: boolean;
  isLoading: boolean;
  
  setClassrooms: (classrooms: Classroom[]) => void;
  setCourses: (courses: Course[]) => void;
  setSessions: (sessions: ClassSession[]) => void;
  setProfessors: (professors: Professor[]) => void;
  addHistoryLog: (log: Omit<HistoryLog, 'id' | 'date'>) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setLanguage: (lang: 'es' | 'en') => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  
  // Cloud Sync
  loadFromCloud: (silent?: boolean) => Promise<void>;
  saveToCloud: (silent?: boolean) => Promise<boolean>;
}

const defaultClassrooms: Classroom[] = defaultData.classrooms as Classroom[];
const defaultCourses: Course[] = defaultData.courses as Course[];
const defaultSessions: ClassSession[] = defaultData.sessions as ClassSession[];
const defaultProfessors: Professor[] = (defaultData.professors || []) as Professor[];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      classrooms: defaultClassrooms,
      courses: defaultCourses,
      sessions: defaultSessions,
      professors: defaultProfessors,
      historyLogs: [],
      theme: 'light',
      language: 'es',
      isAdmin: false,
      isLoading: false,
      
      setClassrooms: (classrooms) => set({ classrooms }),
      setCourses: (courses) => set({ courses }),
      setSessions: (sessions) => set({ sessions }),
      setProfessors: (professors) => set({ professors }),
      addHistoryLog: (log) => set((state) => {
        const newLog: HistoryLog = {
          ...log,
          id: Date.now().toString() + Math.random().toString(36).substring(7),
          date: new Date().toISOString()
        };
        // Keep only the last 10 logs
        const newLogs = [newLog, ...(state.historyLogs || [])].slice(0, 10);
        return { historyLogs: newLogs };
      }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setIsAdmin: (isAdmin) => set({ isAdmin }),
      setIsLoading: (isLoading) => set({ isLoading }),

      loadFromCloud: async (silent = false) => {
        if (!supabase) return;
        if (!silent) set({ isLoading: true });
        try {
          const { data, error } = await supabase
            .from('app_data')
            .select('content')
            .eq('id', 'main_schedule')
            .single();
          
          if (data?.content) {
            const content = data.content;
            set({
              classrooms: content.classrooms || defaultClassrooms,
              courses: content.courses || defaultCourses,
              sessions: content.sessions || defaultSessions,
              professors: content.professors || defaultProfessors,
              historyLogs: content.historyLogs || [],
            });
          }
        } catch (error) {
          console.error('Error loading from cloud:', error);
        } finally {
          if (!silent) set({ isLoading: false });
        }
      },

      saveToCloud: async (silent = false) => {
        if (!supabase) return false;
        if (!silent) set({ isLoading: true });
        try {
          const state = get();
          const content = {
            classrooms: state.classrooms,
            courses: state.courses,
            sessions: state.sessions,
            professors: state.professors,
            historyLogs: state.historyLogs,
          };
          
          const { error } = await supabase
            .from('app_data')
            .upsert({ id: 'main_schedule', content }, { onConflict: 'id' });
          
          if (error) throw error;
          return true;
        } catch (error) {
          console.error('Error saving to cloud:', error);
          return false;
        } finally {
          if (!silent) set({ isLoading: false });
        }
      },
    }),
    {
      name: 'schedule-storage-v2',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        classrooms: state.classrooms,
        courses: state.courses,
        sessions: state.sessions,
        professors: state.professors,
        historyLogs: state.historyLogs,
      }),
    }
  )
);
