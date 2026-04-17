import { useMemo, useState, ChangeEvent, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Camera, Trash2, Download, ArrowLeft, Save, Filter, ImagePlus, CheckCircle2, AlertCircle, Edit2, X } from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAppStore, DayOfWeek } from '../store';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = dataUrl;
  });
}

async function compressImageToFhd(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);

  const maxWidth = 1920;
  const maxHeight = 1080;
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
  const targetWidth = Math.max(1, Math.round(image.width * scale));
  const targetHeight = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export function RecordsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    sessions,
    courses,
    classrooms,
    professors,
    isAdmin,
    dailyRecords,
    loadRecordsFromDb,
    addDailyRecordToDb,
    updateDailyRecordInDb,
    deleteDailyRecordFromDb,
  } = useAppStore();

  const paramSessionId = searchParams.get('sessionId') || '';
  const dayFromQuery = Number(searchParams.get('day'));
  const fallbackDay = ((new Date().getDay() + 6) % 7) as DayOfWeek;
  const selectedDay = Number.isInteger(dayFromQuery) && dayFromQuery >= 0 && dayFromQuery <= 6
    ? (dayFromQuery as DayOfWeek)
    : fallbackDay;

  const availableSessions = useMemo(() => {
    return sessions
      .filter((s) => s.dayOfWeek === selectedDay && s.isActive !== false)
      .sort((a, b) => `${a.startTime}-${a.classroomId}`.localeCompare(`${b.startTime}-${b.classroomId}`));
  }, [sessions, selectedDay]);

  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [studentsCountInput, setStudentsCountInput] = useState('');
  const [description, setDescription] = useState('');
  const [photoDrafts, setPhotoDrafts] = useState<string[]>([]);
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error'; message: string }>>([]);

  const [filterClassroom, setFilterClassroom] = useState('all');
  const [filterProfessor, setFilterProfessor] = useState('all');
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);

  const notify = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 2400);
  };

  useEffect(() => {
    if (paramSessionId && sessions.some((s) => s.id === paramSessionId)) {
      setSelectedSessionId(paramSessionId);
    } else if (availableSessions[0]) {
      setSelectedSessionId(availableSessions[0].id);
    }
  }, [paramSessionId, sessions, availableSessions]);

  useEffect(() => {
    if (!isAdmin) {
      navigate('/admin');
    }
  }, [isAdmin, navigate]);

  useEffect(() => {
    if (isAdmin) {
      void loadRecordsFromDb(true);
    }
  }, [isAdmin, loadRecordsFromDb]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId),
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    if (selectedSession) {
      setStudentsCountInput(
        typeof selectedSession.studentsCount === 'number' ? String(selectedSession.studentsCount) : '',
      );
    }
  }, [selectedSessionId, selectedSession]);

  const resolveProfessorName = (value: string) => {
    const found = professors.find((p) => p.id === value);
    return found?.name || value || 'Sin profesor';
  };

  const selectedCourse = selectedSession
    ? courses.find((c) => c.id === selectedSession.courseId)
    : undefined;

  const selectedClassroom = selectedSession
    ? classrooms.find((c) => c.id === selectedSession.classroomId)
    : undefined;

  const compactText = (value: string, max = 28) => {
    if (!value) return '';
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  };

  const handlePhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList).slice(0, 8);
    try {
      const dataUrls = await Promise.all(files.map(compressImageToFhd));
      setPhotoDrafts((prev) => [...prev, ...dataUrls].slice(0, 12));
    } catch (error) {
      notify('error', 'No se pudo procesar una o mas imagenes.');
    }
    event.target.value = '';
  };

  const removeDraftPhoto = (idx: number) => {
    setPhotoDrafts((prev) => prev.filter((_, index) => index !== idx));
  };

  const findSessionForRecord = (record: { sessionId?: string; courseId: string; classroomId: string; startTime?: string; endTime?: string; dayOfWeek?: DayOfWeek }) => {
    if (record.sessionId) {
      const direct = sessions.find((s) => s.id === record.sessionId);
      if (direct) return direct;
    }

    const byData = sessions.find((s) => {
      const sameDay = typeof record.dayOfWeek === 'number' ? s.dayOfWeek === record.dayOfWeek : true;
      return (
        s.courseId === record.courseId &&
        s.classroomId === record.classroomId &&
        s.startTime === (record.startTime || s.startTime) &&
        s.endTime === (record.endTime || s.endTime) &&
        sameDay
      );
    });
    return byData;
  };

  const handleEditRecord = (record: typeof dailyRecords[number]) => {
    const matchedSession = findSessionForRecord(record);
    if (matchedSession) {
      setSelectedSessionId(matchedSession.id);
    }
    setStudentsCountInput(
      typeof record.studentsCount === 'number' ? String(record.studentsCount) : '',
    );
    setDescription(record.description || '');
    setPhotoDrafts(Array.isArray(record.photos) ? record.photos : []);
    setEditingRecordId(record.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearEditor = () => {
    setEditingRecordId(null);
    setDescription('');
    setPhotoDrafts([]);
    if (selectedSession) {
      setStudentsCountInput(
        typeof selectedSession.studentsCount === 'number' ? String(selectedSession.studentsCount) : '',
      );
    } else {
      setStudentsCountInput('');
    }
  };

  const handleSaveRecord = async () => {
    if (!selectedSession) {
      notify('error', 'Selecciona un horario para registrar.');
      return;
    }

    if (photoDrafts.length === 0) {
      notify('error', 'Agrega al menos una foto del salon.');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        sessionId: selectedSession.id,
        courseId: selectedSession.courseId,
        courseName: selectedCourse?.name || 'Curso',
        classroomId: selectedSession.classroomId,
        classroomName: selectedClassroom?.name || 'Salon',
        professor: resolveProfessorName(selectedSession.professor),
        startTime: selectedSession.startTime,
        endTime: selectedSession.endTime,
        dayOfWeek: selectedSession.dayOfWeek,
        studentsCount: studentsCountInput === '' ? undefined : Math.max(0, Number(studentsCountInput)),
        description: description.trim(),
        photos: photoDrafts,
      };

      const ok = editingRecordId
        ? await updateDailyRecordInDb(editingRecordId, payload)
        : await addDailyRecordToDb(payload);
      if (!ok) {
        notify('error', editingRecordId ? 'No se pudo actualizar en la base de datos.' : 'No se pudo guardar en la base de datos.');
        return;
      }

      clearEditor();
      notify('success', editingRecordId ? 'Registro actualizado correctamente.' : 'Registro guardado correctamente.');
      if (paramSessionId && !editingRecordId) {
        window.setTimeout(() => navigate('/'), 350);
      }
    } catch (error) {
      notify('error', 'No se pudo guardar el registro.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredRecords = useMemo(() => {
    return dailyRecords.filter((record) => {
      if (filterClassroom !== 'all' && record.classroomId !== filterClassroom) return false;
      if (filterProfessor !== 'all' && record.professor !== filterProfessor) return false;
      if (filterCourse !== 'all' && record.courseId !== filterCourse) return false;
      const createdAt = new Date(record.createdAt);
      if (Number.isNaN(createdAt.getTime())) return false;
      const createdDate = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;
      if (filterDateFrom && createdDate < filterDateFrom) return false;
      if (filterDateTo && createdDate > filterDateTo) return false;
      return true;
    });
  }, [dailyRecords, filterClassroom, filterProfessor, filterCourse, filterDateFrom, filterDateTo]);

  const sortedRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filteredRecords]);

  const classroomAverages = useMemo(() => {
    const groups = new Map<string, { classroomName: string; totalStudents: number; countWithStudents: number; totalRecords: number }>();

    filteredRecords.forEach((record) => {
      const key = record.classroomId || record.classroomName;
      const existing = groups.get(key) || {
        classroomName: record.classroomName || 'Salon',
        totalStudents: 0,
        countWithStudents: 0,
        totalRecords: 0,
      };

      existing.totalRecords += 1;
      if (typeof record.studentsCount === 'number' && Number.isFinite(record.studentsCount)) {
        existing.totalStudents += record.studentsCount;
        existing.countWithStudents += 1;
      }
      groups.set(key, existing);
    });

    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        averageStudents: item.countWithStudents > 0
          ? item.totalStudents / item.countWithStudents
          : null,
      }))
      .sort((a, b) => a.classroomName.localeCompare(b.classroomName));
  }, [filteredRecords]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterClassroom, filterProfessor, filterCourse, filterDateFrom, filterDateTo, pageSize]);

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedRecords.slice(start, start + pageSize);
  }, [sortedRecords, safePage, pageSize]);

  const exportRecordsToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Registros');

    sheet.columns = [
      { header: 'Fecha', key: 'date', width: 22 },
      { header: 'Salon', key: 'classroom', width: 20 },
      { header: 'Curso', key: 'course', width: 28 },
      { header: 'Profesor', key: 'professor', width: 24 },
      { header: 'Horario', key: 'time', width: 15 },
      { header: 'Alumnos', key: 'studentsCount', width: 10 },
      { header: 'Descripcion', key: 'description', width: 40 },
      { header: 'Fotos', key: 'photosCount', width: 10 },
    ];

    sortedRecords.forEach((record) => {
      sheet.addRow({
        date: new Date(record.createdAt).toLocaleString(),
        classroom: record.classroomName,
        course: record.courseName,
        professor: record.professor,
        time: record.startTime && record.endTime ? `${record.startTime} - ${record.endTime}` : '-',
        studentsCount: record.studentsCount ?? '',
        description: record.description || '',
        photosCount: record.photos.length,
      });
    });

    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `registros-diarios-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="w-full max-w-none lg:max-w-5xl mx-auto px-3 sm:px-5 lg:px-6 py-4 sm:py-6 space-y-5 sm:space-y-7 overflow-x-hidden">
      <div className="fixed top-3 right-3 z-[9999] flex flex-col gap-2 w-[94vw] sm:w-[380px] pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm flex items-start gap-2 ${
              toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900 dark:bg-emerald-900/70 dark:border-emerald-700 dark:text-emerald-100'
                : 'bg-red-50/95 border-red-200 text-red-900 dark:bg-red-900/70 dark:border-red-700 dark:text-red-100'
            }`}
          >
            {toast.type === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
            <p className="text-sm font-medium leading-snug">{toast.message}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center sm:justify-start gap-2 px-3 py-2.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-sm sm:text-base font-medium w-full sm:w-auto"
        >
          <ArrowLeft size={16} /> Volver al horario
        </button>
        <button
          onClick={exportRecordsToExcel}
          className="inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-sm sm:text-base font-medium w-full sm:w-auto"
        >
          <Download size={16} /> Exportar Excel
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 space-y-5">
        <h1 className="text-[1.55rem] leading-tight sm:text-3xl font-bold">Registro Diario de Salones</h1>
        <p className="text-[0.95rem] sm:text-base text-zinc-600 dark:text-zinc-400 break-words">
          Toca un horario, toma fotos desde tu celular y guarda la evidencia para revisarla despues.
        </p>

        <div className="space-y-2.5">
          <label className="text-[0.95rem] sm:text-base font-semibold">Horario a registrar</label>
          <select
            value={selectedSessionId}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="w-full max-w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3.5 text-base overflow-hidden text-ellipsis"
          >
            {availableSessions.length === 0 && <option value="">No hay horarios activos para hoy</option>}
            {availableSessions.map((session) => {
              const course = courses.find((c) => c.id === session.courseId);
              const classroom = classrooms.find((c) => c.id === session.classroomId);
              return (
                <option key={session.id} value={session.id}>
                  {session.startTime}-{session.endTime} | {compactText(classroom?.name || 'Salon', 18)} | {compactText(course?.name || 'Curso', 24)}
                </option>
              );
            })}
          </select>
        </div>

        {selectedSession && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-sm sm:text-base">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3">
              <div className="text-zinc-500">Curso</div>
              <div className="font-semibold break-words">{selectedCourse?.name || 'Curso'}</div>
            </div>
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3">
              <div className="text-zinc-500">Profesor</div>
              <div className="font-semibold break-words">{resolveProfessorName(selectedSession.professor)}</div>
            </div>
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3">
              <div className="text-zinc-500">Salon</div>
              <div className="font-semibold break-words">{selectedClassroom?.name || 'Salon'}</div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-[0.95rem] sm:text-base font-semibold">Numero de alumnos (registro actual)</label>
          <input
            type="number"
            min={0}
            value={studentsCountInput}
            onChange={(e) => setStudentsCountInput(e.target.value)}
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3.5 text-base"
          />
        </div>

        <div className="space-y-2">
          <label className="text-[0.95rem] sm:text-base font-semibold">Descripcion (opcional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Ejemplo: aula limpia, proyector operativo, observaciones..."
            className="w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3.5 text-base"
          />
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex flex-col gap-3 sm:gap-2">
            <label className="text-[0.95rem] sm:text-base font-semibold">Fotos del estado actual</label>
            <label className="inline-flex w-full sm:w-fit items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-indigo-600 text-white text-base font-semibold cursor-pointer">
              <ImagePlus size={16} /> Tomar / agregar fotos
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handlePhotoSelect}
              />
            </label>
          </div>

          {photoDrafts.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {photoDrafts.map((photo, idx) => (
                <div key={idx} className="relative rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700">
                  <img src={photo} alt={`foto-${idx + 1}`} className="w-full h-36 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeDraftPhoto(idx)}
                    className="absolute top-2 right-2 p-1.5 rounded-full bg-black/70 text-white"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2">
          <button
            onClick={handleSaveRecord}
            disabled={isSaving || !selectedSessionId}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-600 disabled:bg-emerald-300 text-white text-base font-semibold"
          >
            <Save size={16} /> {isSaving ? 'Guardando...' : editingRecordId ? 'Actualizar registro' : 'Guardar registro'}
          </button>
          {editingRecordId && (
            <button
              type="button"
              onClick={clearEditor}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 text-base font-semibold"
            >
              <X size={16} /> Cancelar edicion
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Filter size={16} /> Filtros
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <select value={filterClassroom} onChange={(e) => setFilterClassroom(e.target.value)} className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3 text-base">
            <option value="all">Todos los salones</option>
            {classrooms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterProfessor} onChange={(e) => setFilterProfessor(e.target.value)} className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3 text-base">
            <option value="all">Todos los profesores</option>
            {Array.from(new Set(dailyRecords.map((r) => r.professor))).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)} className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3 text-base">
            <option value="all">Todos los cursos</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3 text-base"
            aria-label="Fecha desde"
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3 text-base"
            aria-label="Fecha hasta"
          />
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-3 text-base"
          >
            <option value={10}>10 por pagina</option>
            <option value={25}>25 por pagina</option>
            <option value={50}>50 por pagina</option>
            <option value={100}>100 por pagina</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-3">
          <h3 className="text-lg sm:text-xl font-semibold">Promedio por salon</h3>
          {classroomAverages.length === 0 ? (
            <p className="text-sm text-zinc-500">No hay datos para calcular promedios con los filtros actuales.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {classroomAverages.map((item) => (
                <div key={item.classroomName} className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 bg-zinc-50 dark:bg-zinc-800/40">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">{item.classroomName}</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">
                    Promedio alumnos:{' '}
                    <span className="font-semibold">
                      {item.averageStudents === null ? '-' : item.averageStudents.toFixed(1)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">
                    Registros: {item.totalRecords} · Con alumnos: {item.countWithStudents}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-2xl font-bold">Historial de Registros ({sortedRecords.length})</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage <= 1}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              Pagina {safePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        </div>

        {sortedRecords.length === 0 && (
          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-sm text-zinc-500">
            Todavia no hay registros guardados.
          </div>
        )}

        {paginatedRecords.map((record) => (
          <div key={record.id} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-bold text-lg sm:text-xl leading-tight">{record.courseName}</div>
                <div className="text-base text-zinc-600 dark:text-zinc-400">
                  {record.classroomName} | {record.professor}
                </div>
                <div className="text-base text-zinc-600 dark:text-zinc-400">
                  Alumnos: {record.studentsCount ?? '-'}
                </div>
                <div className="text-sm text-zinc-500 mt-1">
                  {new Date(record.createdAt).toLocaleString()} {record.startTime && record.endTime ? `| ${record.startTime} - ${record.endTime}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleEditRecord(record)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 text-sm font-medium"
                >
                  <Edit2 size={14} /> Editar
                </button>
                <button
                  onClick={() => {
                    void (async () => {
                      const ok = await deleteDailyRecordFromDb(record.id);
                      if (ok && editingRecordId === record.id) {
                        clearEditor();
                      }
                      notify(ok ? 'success' : 'error', ok ? 'Registro eliminado.' : 'No se pudo eliminar en la base de datos.');
                    })();
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-sm font-medium"
                >
                  <Trash2 size={14} /> Borrar
                </button>
              </div>
            </div>

            {record.description && (
              <p className="text-base leading-relaxed text-zinc-700 dark:text-zinc-300">{record.description}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {record.photos.map((photo, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPreviewImage(photo)}
                  className="block rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700"
                >
                  <img src={photo} alt={`registro-${record.id}-${idx + 1}`} className="w-full h-32 object-cover" />
                </button>
              ))}
            </div>

            <div className="text-sm text-zinc-500 flex items-center gap-1">
              <Camera size={12} /> {record.photos.length} foto(s)
            </div>
          </div>
        ))}
      </div>

      {previewImage && (
        <button
          type="button"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-[10050] bg-black/80 p-3 sm:p-6 flex items-center justify-center"
        >
          <div className="relative w-full max-w-4xl max-h-[92vh]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewImage(null);
              }}
              className="absolute top-2 right-2 p-2 rounded-full bg-black/60 text-white z-10"
            >
              <X size={18} />
            </button>
            <img
              src={previewImage}
              alt="Vista previa"
              className="w-full h-auto max-h-[90vh] object-contain rounded-xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </button>
      )}
    </div>
  );
}

