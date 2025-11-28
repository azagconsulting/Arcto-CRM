"use client";

import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckCircle2,
  Edit,
  Loader2,
  Plus,
  Tag,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AuthUser, CreateEmployeeResponse, UserRole } from "@/lib/types";

const roleOptions: Array<{ label: string; value: UserRole; hint: string }> = [
  { label: "Admin", value: "ADMIN", hint: "Voller Zugriff, Einstellungen & Rollen" },
  { label: "Coordinator", value: "COORDINATOR", hint: "Standardrolle für CS Ops" },
  { label: "Agent", value: "AGENT", hint: "Bearbeitet Kunden & Leads" },
  { label: "Viewer", value: "VIEWER", hint: "Nur Lesezugriff" },
];

type TaskStatus = "BACKLOG" | "IN_PROGRESS" | "REVIEW" | "DONE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";
type TaskBoard = "TEAM" | "MY";
type Task = {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  dueDate?: string;
  createdAt: string;
  board: TaskBoard;
};
type NotificationPermissionState = "default" | "granted" | "denied";

const taskColumns: Array<{ key: TaskStatus; title: string; hint: string }> = [
  { key: "BACKLOG", title: "Backlog", hint: "Ideen und anstehende Aufgaben" },
  { key: "IN_PROGRESS", title: "In Arbeit", hint: "Gerade in Bearbeitung" },
  { key: "REVIEW", title: "Review", hint: "Warten auf Abnahme oder QA" },
  { key: "DONE", title: "Erledigt", hint: "Fertiggestellt" },
];

const priorityMeta: Record<TaskPriority, { label: string; className: string }> = {
  HIGH: { label: "Hoch", className: "bg-rose-500/15 text-rose-200 border border-rose-400/20" },
  MEDIUM: { label: "Mittel", className: "bg-amber-500/15 text-amber-200 border border-amber-400/20" },
  LOW: { label: "Niedrig", className: "bg-emerald-500/15 text-emerald-200 border border-emerald-400/20" },
};
const priorityOrder: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const initialTaskForm = {
  title: "",
  description: "",
  assigneeId: "",
  dueDate: "",
  priority: "MEDIUM" as TaskPriority,
  board: "TEAM" as TaskBoard,
};

// --- Invite Modal ---
type InviteFormState = { firstName: string; lastName: string; email: string; role: UserRole; password: string; };
const initialInviteForm: InviteFormState = { firstName: "", lastName: "", email: "", role: "COORDINATOR", password: "" };

interface InviteEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onEmployeeInvited: (employee: AuthUser) => void;
  afterContent?: React.ReactNode;
  afterContentRef?: React.RefObject<HTMLDivElement>;
}

function InviteEmployeeModal({ open, onClose, onEmployeeInvited, afterContent, afterContentRef }: InviteEmployeeModalProps) {
  const { authorizedRequest } = useAuth();
  const [inviteForm, setInviteForm] = useState(initialInviteForm);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInviteForm(initialInviteForm);
      setInviteNotice(null);
      setGeneratedPassword(null);
      setInviteLoading(false);
    }
  }, [open]);

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteLoading(true);
    setInviteNotice(null);
    setGeneratedPassword(null);
    try {
      const payload = {
        firstName: inviteForm.firstName.trim() || undefined,
        lastName: inviteForm.lastName.trim() || undefined,
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        password: inviteForm.password.trim() || undefined,
      };

      const response = await authorizedRequest<CreateEmployeeResponse>("/users", {
        method: "POST", body: JSON.stringify(payload),
      });

      const fallbackPassword = inviteForm.password.trim() || null;
      setGeneratedPassword(response.temporaryPassword ?? fallbackPassword);

      if (response.inviteEmailSent) {
        setInviteNotice({ type: "success", text: "Mitarbeiter erstellt. Einladung per E-Mail verschickt." });
      } else if (response.inviteEmailError) {
        setInviteNotice({
          type: "error",
          text: `Account erstellt, aber E-Mail konnte nicht gesendet werden: ${response.inviteEmailError}`,
        });
      } else {
        setInviteNotice({
          type: "error",
          text: "Account erstellt, aber E-Mail wurde nicht versendet. Bitte SMTP prüfen.",
        });
      }

      onEmployeeInvited(response.user);
    } catch (err) {
      setInviteNotice({ type: "error", text: err instanceof Error ? err.message : "Einladung fehlgeschlagen." });
    } finally {
      setInviteLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div className="flex w-full max-w-5xl flex-col items-center gap-6">
        <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
          <div className="mb-6 pr-10">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
            <h2 className="text-2xl font-semibold text-white">Mitarbeiter einladen</h2>
            <p className="text-sm text-slate-400">Passwort automatisch generieren oder selbst definieren.</p>
          </div>
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white" aria-label="Modal schließen" >
            <X className="h-4 w-4" />
          </button>
          
          <form className="space-y-4" onSubmit={handleInviteSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">Vorname <Input className="mt-2" value={inviteForm.firstName} onChange={(e) => setInviteForm(f => ({...f, firstName: e.target.value}))} placeholder="Mara" /></label>
                <label className="text-sm text-slate-300">Nachname <Input className="mt-2" value={inviteForm.lastName} onChange={(e) => setInviteForm(f => ({...f, lastName: e.target.value}))} placeholder="Schneider" /></label>
              </div>
              <label className="text-sm text-slate-300">E-Mail <Input type="email" className="mt-2" value={inviteForm.email} onChange={(e) => setInviteForm(f => ({...f, email: e.target.value}))} placeholder="mara@arcto.app" required /></label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Rolle
                  <select className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none" value={inviteForm.role} onChange={(e) => setInviteForm(f => ({...f, role: e.target.value as UserRole}))}>
                    {roleOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">{roleOptions.find((role) => role.value === inviteForm.role)?.hint}</p>
                </label>
                <label className="text-sm text-slate-300">
                  Passwort (optional)
                  <Input type="password" className="mt-2" value={inviteForm.password} onChange={(e) => setInviteForm(f => ({...f, password: e.target.value}))} placeholder="leer für Autogenerierung" />
                </label>
              </div>
              {inviteNotice && <p className={clsx("text-xs", inviteNotice.type === "success" ? "text-emerald-300" : "text-rose-300")}>{inviteNotice.text}</p>}
              {generatedPassword && <p className="text-xs text-sky-300">Temporäres Passwort: <span className="font-mono">{generatedPassword}</span></p>}
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
                <Button type="submit" disabled={inviteLoading}>{inviteLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserPlus className="h-4 w-4" />} Einladung senden</Button>
              </div>
          </form>
        </div>
        {afterContent ? <div ref={afterContentRef} className="w-full">{afterContent}</div> : null}
      </div>
    </div>
  );
}

// --- Edit Modal ---
type EditFormState = { firstName: string; lastName: string; role: UserRole; };

interface EditEmployeeModalProps {
  open: boolean;
  employee: AuthUser | null;
  onClose: () => void;
  onEmployeeUpdated: (employee: AuthUser) => void;
}

function EditEmployeeModal({ open, employee, onClose, onEmployeeUpdated }: EditEmployeeModalProps) {
    const { authorizedRequest } = useAuth();
    const [form, setForm] = useState<EditFormState>({ firstName: '', lastName: '', role: 'AGENT' });
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if(open && employee) {
            setForm({
                firstName: employee.firstName ?? '',
                lastName: employee.lastName ?? '',
                role: employee.role,
            });
            setNotice(null);
            setLoading(false);
        }
    }, [open, employee]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if(!employee) return;
        setLoading(true);
        setNotice(null);

        try {
            const payload = {
                firstName: form.firstName.trim() || undefined,
                lastName: form.lastName.trim() || undefined,
                role: form.role,
            };
            const updated = await authorizedRequest<AuthUser>(`/users/${employee.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
            onEmployeeUpdated(updated);
        } catch(err) {
            setNotice(err instanceof Error ? err.message : 'Update fehlgeschlagen.');
        } finally {
            setLoading(false);
        }
    }

    if(!open || !employee) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
          <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
            <div className="mb-6 pr-10">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Mitarbeiter bearbeiten</p>
              <h2 className="text-2xl font-semibold text-white">{employee.firstName} {employee.lastName}</h2>
              <p className="text-sm text-slate-400">{employee.email}</p>
            </div>
            <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white" aria-label="Modal schließen" >
              <X className="h-4 w-4" />
            </button>
            
            <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm text-slate-300">Vorname <Input className="mt-2" value={form.firstName} onChange={(e) => setForm(f => ({...f, firstName: e.target.value}))} /></label>
                  <label className="text-sm text-slate-300">Nachname <Input className="mt-2" value={form.lastName} onChange={(e) => setForm(f => ({...f, lastName: e.target.value}))} /></label>
                </div>
                <label className="text-sm text-slate-300">
                    Rolle
                    <select className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none" value={form.role} onChange={(e) => setForm(f => ({...f, role: e.target.value as UserRole}))}>
                        {roleOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                    </select>
                </label>
                {notice && <p className="text-xs text-rose-300">{notice}</p>}
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
                  <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Speichern</Button>
                </div>
            </form>
          </div>
        </div>
    );
}

export default function MitarbeiterPage() {
  const { authorizedRequest, user } = useAuth();
  const searchParams = useSearchParams();
  const searchParamString = searchParams?.toString();
  const [employees, setEmployees] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [showAccessSection, setShowAccessSection] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<AuthUser | null>(null);
  const [highlightAccess, setHighlightAccess] = useState(false);
  const accessSectionRef = useRef<HTMLDivElement | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermissionState>("default");
  const [tasksByBoard, setTasksByBoard] = useState<Record<TaskBoard, Task[]>>({ TEAM: [], MY: [] });
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskForm, setTaskForm] = useState(initialTaskForm);
  const [taskNotice, setTaskNotice] = useState<string | null>(null);
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [activeBoard, setActiveBoard] = useState<TaskBoard>("TEAM");

  const employeeNameById = useMemo(() => {
    const map: Record<string, string> = {};
    employees.forEach((emp) => {
      const name = emp.firstName || emp.lastName ? `${emp.firstName ?? ""} ${emp.lastName ?? ""}`.trim() : emp.email;
      map[emp.id] = name || emp.email;
    });
    return map;
  }, [employees]);
  const myUserId = user?.id;

  const normalizeTask = (task: any): Task => ({
    id: task.id,
    title: task.title,
    description: task.description ?? undefined,
    status: task.status as TaskStatus,
    priority: task.priority as TaskPriority,
    assigneeId: task.assigneeId ?? task.assignee?.id ?? undefined,
    dueDate: task.dueDate ?? undefined,
    createdAt: task.createdAt ?? new Date().toISOString(),
    board: (task.board as TaskBoard) ?? "TEAM",
  });

  useEffect(() => {
    const controller = new AbortController();
    async function fetchEmployees() {
      setLoading(true);
      setError(null);
      try {
        const data = await authorizedRequest<AuthUser[]>("/users", { signal: controller.signal });
        setEmployees(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Mitarbeiter konnten nicht geladen werden.");
        }
      } finally {
        setLoading(false);
      }
    }
    void fetchEmployees();
    return () => controller.abort();
  }, [authorizedRequest]);

  const loadTasks = useCallback(
    async (board: TaskBoard) => {
      setTasksLoading(true);
      try {
        const data = await authorizedRequest<unknown[]>(`/tasks?board=${board}`);
        setTasksByBoard((current) => ({ ...current, [board]: (data ?? []).map(normalizeTask) }));
      } catch (err) {
        setTaskNotice(err instanceof Error ? err.message : "Tasks konnten nicht geladen werden.");
      } finally {
        setTasksLoading(false);
      }
    },
    [authorizedRequest],
  );

  useEffect(() => {
    if (!user) return;
    void loadTasks(activeBoard);
  }, [activeBoard, loadTasks, user]);

  useEffect(() => {
    setTaskForm((f) => ({ ...f, board: activeBoard }));
  }, [activeBoard]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationPermission(Notification.permission as NotificationPermissionState);
    if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission as NotificationPermissionState);
      });
    }
  }, []);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [employees]);

  const focusAccessSection = () => {
    if (!accessSectionRef.current) return;
    accessSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    setHighlightAccess(true);
    window.setTimeout(() => setHighlightAccess(false), 1200);
  };

  useEffect(() => {
    if (showAccessSection) {
      focusAccessSection();
    }
  }, [showAccessSection]);

  useEffect(() => {
    const wantsInvite = searchParams?.get("invite") === "1";
    const wantsAccessTab = searchParams?.get("tab") === "zugang" || wantsInvite;

    if (wantsAccessTab) {
      setShowAccessSection(true);
      focusAccessSection();
    }
    if (wantsInvite) {
      setInviteModalOpen(true);
    }
  }, [searchParamString]);

  const handleEmployeeInvited = (newEmployee: AuthUser) => {
    setEmployees((current) => [newEmployee, ...current]);
    setTimeout(() => {
      setInviteModalOpen(false);
      setShowAccessSection(false);
    }, 1500);
  };

  const handleEmployeeUpdated = (updatedEmployee: AuthUser) => {
    setEmployees(current => current.map(e => e.id === updatedEmployee.id ? updatedEmployee : e));
    setEditingEmployee(null);
  };

  const handleDelete = async (employeeId: string) => {
    if (!window.confirm("Soll dieser Mitarbeiter wirklich gelöscht werden?")) return;
    
    try {
        await authorizedRequest(`/users/${employeeId}`, { method: 'DELETE' });
        setEmployees(current => current.filter(e => e.id !== employeeId));
    } catch(err) {
        setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }

  const triggerTaskNotification = useCallback((task: Task) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const title = `Neue Aufgabe: ${task.title}`;
    const body = task.assigneeId
      ? `Zugewiesen an ${employeeNameById[task.assigneeId] ?? "Team"}.`
      : "Keine Zuordnung – bitte übernehmen.";

    if (Notification.permission === "granted") {
      // eslint-disable-next-line no-new
      new Notification(title, { body, tag: task.id });
    } else if (Notification.permission === "default") {
      Notification.requestPermission().then((permission) => {
        setNotificationPermission(permission as NotificationPermissionState);
        if (permission === "granted") {
          // eslint-disable-next-line no-new
          new Notification(title, { body, tag: task.id });
        }
      });
    }
  }, [employeeNameById]);

  const handleTaskSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!taskForm.title.trim()) {
      setTaskNotice("Bitte einen Titel vergeben.");
      return;
    }
    try {
      const createdResponse = await authorizedRequest<unknown>("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || undefined,
          priority: taskForm.priority,
          assigneeId: taskForm.assigneeId || undefined,
          dueDate: taskForm.dueDate || undefined,
          board: taskForm.board,
        }),
      });
      const created = normalizeTask(createdResponse);
      setTasksByBoard((current) => ({
        ...current,
        [created.board]: [created, ...(current[created.board] ?? [])],
      }));
      setTaskForm((f) => ({ ...initialTaskForm, board: f.board }));
      setTaskNotice("Aufgabe angelegt.");
      setTaskModalOpen(false);
      triggerTaskNotification(created);
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Aufgabe konnte nicht erstellt werden.");
    }
  };

  const findTaskById = (taskId: string) => {
    const boardKeys: TaskBoard[] = ["TEAM", "MY"];
    for (const board of boardKeys) {
      const found = tasksByBoard[board]?.find((task) => task.id === taskId);
      if (found) return found;
    }
    return undefined;
  };

  const updateTaskInState = (updatedTask: Task) => {
    setTasksByBoard((current) => {
      const boardKeys: TaskBoard[] = ["TEAM", "MY"];
      const nextState: Record<TaskBoard, Task[]> = { ...current };
      boardKeys.forEach((board) => {
        nextState[board] = (nextState[board] ?? []).filter((task) => task.id !== updatedTask.id);
      });
      const targetBoard = updatedTask.board;
      nextState[targetBoard] = [updatedTask, ...(nextState[targetBoard] ?? [])];
      return nextState;
    });
  };

  const handleTaskStatusChange = async (taskId: string, status: TaskStatus) => {
    const existing = findTaskById(taskId);
    if (!existing) return;
    try {
      const updatedResponse = await authorizedRequest<unknown>(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      updateTaskInState(normalizeTask(updatedResponse));
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Status konnte nicht geändert werden.");
    }
  };

  const handleTaskAssigneeChange = async (taskId: string, assigneeId: string) => {
    const existing = findTaskById(taskId);
    if (!existing) return;
    try {
      const updatedResponse = await authorizedRequest<unknown>(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigneeId: assigneeId || null }),
      });
      updateTaskInState(normalizeTask(updatedResponse));
    } catch (err) {
      setTaskNotice(err instanceof Error ? err.message : "Zuweisung konnte nicht geändert werden.");
    }
  };

  const handleDragStart = (taskId: string) => {
    setDragTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDragTaskId(null);
    setDragOverColumn(null);
  };

  const handleColumnDragOver = (event: React.DragEvent<HTMLDivElement>, status: TaskStatus) => {
    event.preventDefault();
    if (dragOverColumn !== status) {
      setDragOverColumn(status);
    }
  };

  const handleDropOnColumn = async (status: TaskStatus) => {
    if (!dragTaskId) return;
    await handleTaskStatusChange(dragTaskId, status);
    setDragTaskId(null);
    setDragOverColumn(null);
  };

  useEffect(() => {
    if (!taskNotice) return;
    const timeout = window.setTimeout(() => setTaskNotice(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [taskNotice]);

  const filteredTasks = useMemo(() => {
    return tasksByBoard[activeBoard] ?? [];
  }, [tasksByBoard, activeBoard]);

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      BACKLOG: [],
      IN_PROGRESS: [],
      REVIEW: [],
      DONE: [],
    };
    filteredTasks.forEach((task) => {
      grouped[task.status]?.push(task);
    });
    return grouped;
  }, [filteredTasks]);

  const openTasks = filteredTasks.filter((task) => task.status !== "DONE").length;

  const renderAccessSection = () => (
    <div
      className={clsx(
        "w-full rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl",
        "transition-shadow",
        highlightAccess && "shadow-[0_0_0_2px_rgba(56,189,248,0.5)]",
      )}
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
          <h3 className="text-xl font-semibold text-white">Zugänge & Aktivitäten</h3>
          <p className="text-sm text-slate-400">Wer nutzt das CRM? Alle Accounts transparent in einer Liste.</p>
        </div>
        <div className="text-xs text-slate-400">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : `${employees.length} Einträge`}
        </div>
      </div>
      {error && <p className="mb-3 text-xs text-rose-300"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{error}</p>}
      <div className="space-y-4">
        {loading && <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Mitarbeiter werden geladen...</p>}
        {!loading && sortedEmployees.length === 0 && <p className="text-sm text-slate-400">Noch keine Zugänge vorhanden.</p>}
        {sortedEmployees.map((employee) => (
          <div key={employee.id} className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold text-white">{employee.firstName ? `${employee.firstName} ${employee.lastName ?? ""}`.trim() : employee.email}</p>
                <p className="text-xs text-slate-400">{employee.email}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">{employee.role.toLowerCase()}</span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingEmployee(employee)}
                  >
                    <Edit className="h-4 w-4" /> Bearbeiten
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-300 hover:text-rose-200"
                    onClick={() => handleDelete(employee.id)}
                    disabled={user?.id === employee.id}
                    title={user?.id === employee.id ? "Eigener Zugang kann nicht gelöscht werden." : undefined}
                  >
                    <Trash2 className="h-4 w-4" /> Löschen
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
            <h1 className="text-3xl font-semibold text-white">Mitarbeiter</h1>
            <p className="text-sm text-slate-400">Kolleg:innen hinzufügen und Zugänge verwalten.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTaskForm((f) => ({ ...initialTaskForm, board: activeBoard, assigneeId: f.assigneeId }));
                setTaskModalOpen(true);
              }}
              className="border-white/20 text-white hover:border-sky-400"
            >
              <Plus className="h-4 w-4" /> Aufgabe erstellen
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setShowAccessSection(true);
                focusAccessSection();
                setInviteModalOpen(true);
              }}
            >
              <UserPlus className="h-4 w-4" /> Mitarbeiter einladen
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1 text-xs text-sky-200">
                <Users className="h-4 w-4" /> {employees.length} Mitarbeitende
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
                <Tag className="h-4 w-4" /> {openTasks} offene Aufgaben
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                <CheckCircle2 className="h-4 w-4" /> {tasksByStatus.DONE.length} erledigt
              </span>
            </div>
            <div className="flex gap-2">
              {(["TEAM", "MY"] as const).map((boardKey) => (
                <button
                  key={boardKey}
                  type="button"
                  onClick={() => setActiveBoard(boardKey)}
                  className={clsx(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    activeBoard === boardKey
                      ? "bg-sky-500/20 text-white border border-sky-400/50"
                      : "bg-white/5 text-slate-300 border border-white/10 hover:border-sky-400/40",
                  )}
                >
                  {boardKey === "TEAM" ? "Teamboard" : "Mein Board"}
                </button>
              ))}
              {tasksLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-300" />}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 min-h-[75vh] max-h-[calc(100vh-180px)] overflow-hidden">
            {taskColumns.map((column) => {
              const columnTasks = tasksByStatus[column.key] ?? [];
              const sortedColumnTasks = [...columnTasks].sort((a, b) => {
                const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (priorityDiff !== 0) return priorityDiff;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              });
              return (
                <div
                  key={column.key}
                  className={clsx(
                    "flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200 shadow-xl",
                    dragOverColumn === column.key && "border-sky-400/60 shadow-[0_0_0_2px_rgba(56,189,248,0.25)]",
                  )}
                  onDragOver={(e) => handleColumnDragOver(e, column.key)}
                  onDrop={() => handleDropOnColumn(column.key)}
                  onDragLeave={() => setDragOverColumn(null)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{column.hint}</p>
                      <h4 className="text-lg font-semibold text-white">{column.title}</h4>
                    </div>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                      {columnTasks.length}
                    </span>
                  </div>
                  <div className="mt-4 flex-1 space-y-3 overflow-auto pr-2">
                    {columnTasks.length === 0 && (
                      <p className="text-xs text-slate-400">Keine Aufgaben in diesem Schritt.</p>
                    )}
                    {sortedColumnTasks.map((task) => (
                      <div
                        key={task.id}
                        className={clsx(
                          "rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200 shadow-sm",
                          dragTaskId === task.id && "border-sky-400/50",
                        )}
                        draggable
                        onDragStart={() => handleDragStart(task.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-white">{task.title}</p>
                            {task.description && (
                              <p className="mt-1 line-clamp-3 text-xs text-slate-400">{task.description}</p>
                            )}
                          </div>
                          <span className={clsx("rounded-full px-3 py-1 text-xs", priorityMeta[task.priority].className)}>
                            {priorityMeta[task.priority].label}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                            <Users className="h-3.5 w-3.5" />
                            {task.assigneeId ? employeeNameById[task.assigneeId] ?? "Zugewiesen" : "Unzugewiesen"}
                          </span>
                          {task.dueDate && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                              <Calendar className="h-3.5 w-3.5" />
                              {new Date(task.dueDate).toLocaleDateString("de-DE")}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
                            <Tag className="h-3.5 w-3.5" />
                            Erstellt {new Date(task.createdAt).toLocaleDateString("de-DE")}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <label className="text-xs text-slate-300">
                            Status
                            <select
                              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                              value={task.status}
                              onChange={(e) => handleTaskStatusChange(task.id, e.target.value as TaskStatus)}
                            >
                              {taskColumns.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-slate-300">
                            Zuständig
                            <select
                              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                              value={task.assigneeId ?? ""}
                              onChange={(e) => handleTaskAssigneeChange(task.id, e.target.value)}
                            >
                              <option value="">Offen</option>
                              {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>
                                  {employeeNameById[emp.id] ?? emp.email}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <InviteEmployeeModal 
        open={isInviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          setShowAccessSection(false);
        }}
        onEmployeeInvited={handleEmployeeInvited}
        afterContent={isInviteModalOpen && showAccessSection ? renderAccessSection() : null}
        afterContentRef={accessSectionRef}
      />

      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
          <div className="relative w-full max-w-2xl rounded-[28px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
            <div className="mb-4 pr-10">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Aufgabenplaner</p>
              <h3 className="text-2xl font-semibold text-white">Neue Aufgabe erstellen</h3>
              <p className="text-sm text-slate-400">Titel, Beschreibung, Priorität und Zuständige festlegen.</p>
            </div>
            <button
              type="button"
              onClick={() => setTaskModalOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white"
              aria-label="Modal schließen"
            >
              <X className="h-4 w-4" />
            </button>
            <form className="space-y-3" onSubmit={handleTaskSubmit}>
              <label className="block text-sm text-slate-300">
                Titel
                <Input
                  className="mt-2"
                  value={taskForm.title}
                  onChange={(e) => setTaskForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Follow-up an ACME senden"
                  required
                />
              </label>
              <label className="block text-sm text-slate-300">
                Beschreibung
                <Textarea
                  className="mt-2"
                  rows={3}
                  value={taskForm.description}
                  onChange={(e) => setTaskForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Kontext, Links oder Checkliste hinzufügen..."
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Fällig
                  <Input
                    className="mt-2"
                    type="date"
                    value={taskForm.dueDate}
                    onChange={(e) => setTaskForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </label>
                <label className="block text-sm text-slate-300">
                  Priorität
                  <select
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                    value={taskForm.priority}
                    onChange={(e) => setTaskForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                  >
                    <option value="HIGH">Hoch</option>
                    <option value="MEDIUM">Mittel</option>
                    <option value="LOW">Niedrig</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Zuständig
                  <select
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                    value={taskForm.assigneeId}
                    onChange={(e) => setTaskForm((f) => ({ ...f, assigneeId: e.target.value }))}
                  >
                    <option value="">Noch nicht zugewiesen</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {employeeNameById[emp.id] ?? emp.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-slate-300">
                  Board
                  <select
                    className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                    value={taskForm.board}
                    onChange={(e) => setTaskForm((f) => ({ ...f, board: e.target.value as Task["board"] }))}
                  >
                    <option value="TEAM">Teamboard</option>
                    <option value="MY">Mein Board</option>
                  </select>
                </label>
              </div>
              {taskNotice && <p className="text-xs text-emerald-300">{taskNotice}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setTaskModalOpen(false)}>
                  Abbrechen
                </Button>
                <Button type="submit">
                  <Plus className="h-4 w-4" /> Aufgabe erstellen
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <EditEmployeeModal
        open={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
    </>
  );
}
