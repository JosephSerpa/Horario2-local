import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import defaultData from './data.json';

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
  endTime: string; // "10:00"
  module: string;
  studentsCount: number;
  classroomId: string;
  dayOfWeek: DayOfWeek;
  groupId?: string;
  isActive?: boolean;
}

export interface HistoryLog {
  id: string;
  action: 'add' | 'edit' | 'delete' | 'toggle';
  courseName: string;
  description: string;
  date: string;
}

export interface DailyClassRecord {
  id: string;
  sessionId?: string;
  courseId: string;
  courseName: string;
  classroomId: string;
  classroomName: string;
  professor: string;
  startTime?: string;
  endTime?: string;
  dayOfWeek?: DayOfWeek;
  studentsCount?: number;
  description?: string;
  photos: string[];
  createdAt: string;
}

interface AppContent {
  classrooms: Classroom[];
  courses: Course[];
  sessions: ClassSession[];
  professors: Professor[];
  historyLogs: HistoryLog[];
}

interface AppState extends AppContent {
  dailyRecords: DailyClassRecord[];
  theme: 'light' | 'dark';
  language: 'es' | 'en';
  isAdmin: boolean;
  isLoading: boolean;

  setClassrooms: (classrooms: Classroom[]) => void;
  setCourses: (courses: Course[]) => void;
  setSessions: (sessions: ClassSession[]) => void;
  setProfessors: (professors: Professor[]) => void;
  setDailyRecords: (records: DailyClassRecord[]) => void;

  loadRecordsFromDb: (silent?: boolean) => Promise<void>;
  addDailyRecordToDb: (record: Omit<DailyClassRecord, 'id' | 'createdAt'>) => Promise<boolean>;
  updateDailyRecordInDb: (id: string, record: Omit<DailyClassRecord, 'id' | 'createdAt'>) => Promise<boolean>;
  deleteDailyRecordFromDb: (id: string) => Promise<boolean>;

  addHistoryLog: (log: Omit<HistoryLog, 'id' | 'date'>) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  setLanguage: (lang: 'es' | 'en') => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;

  loadFromCloud: (silent?: boolean) => Promise<void>;
  saveToCloud: (silent?: boolean) => Promise<boolean>;
}

const defaultClassrooms: Classroom[] = defaultData.classrooms as Classroom[];
const defaultCourses: Course[] = defaultData.courses as Course[];
const defaultSessions: ClassSession[] = defaultData.sessions as ClassSession[];
const defaultProfessors: Professor[] = (defaultData.professors || []) as Professor[];

const fallbackContent: AppContent = {
  classrooms: defaultClassrooms,
  courses: defaultCourses,
  sessions: defaultSessions,
  professors: defaultProfessors,
  historyLogs: [],
};

function normalizeContent(content: Partial<AppContent> | undefined): AppContent {
  return {
    classrooms: Array.isArray(content?.classrooms) ? content.classrooms : fallbackContent.classrooms,
    courses: Array.isArray(content?.courses) ? content.courses : fallbackContent.courses,
    sessions: Array.isArray(content?.sessions) ? content.sessions : fallbackContent.sessions,
    professors: Array.isArray(content?.professors) ? content.professors : fallbackContent.professors,
    historyLogs: Array.isArray(content?.historyLogs) ? content.historyLogs : fallbackContent.historyLogs,
  };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...fallbackContent,
      dailyRecords: [],
      theme: 'light',
      language: 'es',
      isAdmin: false,
      isLoading: false,

      setClassrooms: (classrooms) => set({ classrooms }),
      setCourses: (courses) => set({ courses }),
      setSessions: (sessions) => set({ sessions }),
      setProfessors: (professors) => set({ professors }),
      setDailyRecords: (dailyRecords) => set({ dailyRecords }),

      loadRecordsFromDb: async (silent = true) => {
        if (!silent) set({ isLoading: true });
        try {
          const response = await fetch('/api/records', { method: 'GET', cache: 'no-store' });
          if (!response.ok) throw new Error(`Failed to load records: ${response.status}`);
          const data = await response.json();
          set({ dailyRecords: Array.isArray(data?.records) ? data.records : [] });
        } catch (error) {
          console.error('Error loading records from DB:', error);
        } finally {
          if (!silent) set({ isLoading: false });
        }
      },

      addDailyRecordToDb: async (record) => {
        try {
          const response = await fetch('/api/records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          });
          if (!response.ok) throw new Error(`Failed to create record: ${response.status}`);
          await get().loadRecordsFromDb(true);
          return true;
        } catch (error) {
          console.error('Error creating record in DB:', error);
          return false;
        }
      },

      updateDailyRecordInDb: async (id, record) => {
        try {
          const response = await fetch(`/api/records/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record),
          });
          if (!response.ok) throw new Error(`Failed to update record: ${response.status}`);
          await get().loadRecordsFromDb(true);
          return true;
        } catch (error) {
          console.error('Error updating record in DB:', error);
          return false;
        }
      },

      deleteDailyRecordFromDb: async (id) => {
        try {
          const response = await fetch(`/api/records/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          if (!response.ok) throw new Error(`Failed to delete record: ${response.status}`);
          await get().loadRecordsFromDb(true);
          return true;
        } catch (error) {
          console.error('Error deleting record from DB:', error);
          return false;
        }
      },

      addHistoryLog: (log) =>
        set((state) => {
          const newLog: HistoryLog = {
            ...log,
            id: Date.now().toString() + Math.random().toString(36).substring(7),
            date: new Date().toISOString(),
          };
          const newLogs = [newLog, ...(state.historyLogs || [])].slice(0, 10);
          return { historyLogs: newLogs };
        }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setIsAdmin: (isAdmin) => set({ isAdmin }),
      setIsLoading: (isLoading) => set({ isLoading }),

      loadFromCloud: async (silent = false) => {
        if (!silent) set({ isLoading: true });
        try {
          const response = await fetch('/api/data', {
            method: 'GET',
            cache: 'no-store',
          });

          if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status}`);
          }

          const data = await response.json();
          const normalized = normalizeContent(data?.content);
          set(normalized);
          await get().loadRecordsFromDb(true);
        } catch (error) {
          console.error('Error loading from local DB:', error);
        } finally {
          if (!silent) set({ isLoading: false });
        }
      },

      saveToCloud: async (silent = false) => {
        if (!silent) set({ isLoading: true });
        try {
          const state = get();
          const content: AppContent = {
            classrooms: state.classrooms,
            courses: state.courses,
            sessions: state.sessions,
            professors: state.professors,
            historyLogs: state.historyLogs,
          };

          const response = await fetch('/api/data', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(content),
          });

          if (!response.ok) {
            throw new Error(`Failed to save data: ${response.status}`);
          }

          return true;
        } catch (error) {
          console.error('Error saving to local DB:', error);
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
      }),
    },
  ),
);
