import { create } from 'zustand';
import type { ProjectMeta } from '../../shared/types';

interface ProjectState {
  projects: ProjectMeta[];
  activeProjectId: string | null;

  addProject: (project: ProjectMeta) => void;
  removeProject: (id: string) => Promise<void>;
  setActiveProject: (id: string) => void;
  getActiveProject: () => ProjectMeta | null;
  fetchProjects: () => Promise<void>;
}

const STORAGE_KEY = 'janus_projects';
const ACTIVE_PROJECT_KEY = 'janus_active_project_id';

function loadFromStorage(): ProjectMeta[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function loadActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

function saveToStorage(projects: ProjectMeta[], activeProjectId: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    if (activeProjectId) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  } catch {
    // Silently fail - localStorage might be full or disabled
  }
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: loadFromStorage(),
  activeProjectId: loadActiveProjectId(),

  addProject: (project) => {
    set((state) => {
      // Check for duplicate by path
      const existing = state.projects.find(p => p.path === project.path);
      let newProjects: ProjectMeta[];

      if (existing) {
        // Update existing project
        newProjects = state.projects.map(p =>
          p.path === project.path ? { ...p, ...project } : p
        );
      } else {
        // Add new project at the top
        newProjects = [project, ...state.projects];
      }

      saveToStorage(newProjects, project.id);
      return { projects: newProjects, activeProjectId: project.id };
    });
  },

  removeProject: async (id) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    } catch {
      // Continue with local removal even if server fails
    }

    set((state) => {
      const newProjects = state.projects.filter(p => p.id !== id);
      const newActiveId = state.activeProjectId === id
        ? (newProjects[0]?.id ?? null)
        : state.activeProjectId;
      saveToStorage(newProjects, newActiveId);
      return { projects: newProjects, activeProjectId: newActiveId };
    });
  },

  setActiveProject: (id) => {
    set((state) => {
      const newProjects = state.projects.map(p =>
        p.id === id ? { ...p, lastAccessedAt: new Date().toISOString() } : p
      );
      saveToStorage(newProjects, id);
      return { activeProjectId: id, projects: newProjects };
    });
  },

  getActiveProject: () => {
    const state = get();
    return state.projects.find(p => p.id === state.activeProjectId) || null;
  },

  fetchProjects: async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        const projects = data.projects as ProjectMeta[];
        const storedActiveId = loadActiveProjectId();
        const activeProjectId = storedActiveId && projects.some(p => p.id === storedActiveId)
          ? storedActiveId
          : projects[0]?.id ?? null;
        set({ projects, activeProjectId });
        saveToStorage(projects, activeProjectId);
      }
    } catch {
      // Silently fail - use cached data from localStorage
    }
  },
}));
