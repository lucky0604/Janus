import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from './project-store';
import type { ProjectMeta } from '../../shared/types';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

vi.stubGlobal('localStorage', localStorageMock);

describe('useProjectStore', () => {
  beforeEach(() => {
    localStorageMock.clear();
    useProjectStore.setState({
      projects: [],
      activeProjectId: null,
    });
  });

  const createMockProject = (overrides?: Partial<ProjectMeta>): ProjectMeta => ({
    id: crypto.randomUUID(),
    name: 'test-project',
    path: '/test/path',
    lastAccessedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  describe('addProject', () => {
    it('should add a new project to the list', () => {
      const project = createMockProject();
      useProjectStore.getState().addProject(project);

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0]).toEqual(project);
      expect(state.activeProjectId).toBe(project.id);
    });

    it('should update existing project with same path', () => {
      const project1 = createMockProject({ id: '1', lastAccessedAt: '2024-01-01T00:00:00Z' });
      const project2 = createMockProject({ id: '2', lastAccessedAt: '2024-06-01T00:00:00Z' });

      useProjectStore.getState().addProject(project1);
      useProjectStore.getState().addProject(project2);

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe('2');
      expect(state.projects[0].lastAccessedAt).toBe('2024-06-01T00:00:00Z');
    });

    it('should persist to localStorage', () => {
      const project = createMockProject();
      useProjectStore.getState().addProject(project);

      const stored = localStorage.getItem('janus_projects');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
    });
  });

  describe('removeProject', () => {
    it('should remove a project by ID', () => {
      const project1 = createMockProject({ id: '1' });
      const project2 = createMockProject({ id: '2' });

      useProjectStore.getState().addProject(project1);
      useProjectStore.getState().addProject(project2);
      useProjectStore.getState().removeProject('1');

      const state = useProjectStore.getState();
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe('2');
    });

    it('should clear activeProjectId if removed project was active and no others remain', async () => {
      const project = createMockProject({ id: '1' });
      useProjectStore.getState().addProject(project);
      await useProjectStore.getState().removeProject('1');

      const state = useProjectStore.getState();
      expect(state.activeProjectId).toBeNull();
    });

    it('should select another project when active project is removed', async () => {
      const project1 = createMockProject({ id: '1' });
      const project2 = createMockProject({ id: '2', path: '/other/path' });
      useProjectStore.getState().addProject(project1);
      useProjectStore.getState().addProject(project2);
      useProjectStore.getState().setActiveProject('1');
      await useProjectStore.getState().removeProject('1');

      const state = useProjectStore.getState();
      expect(state.activeProjectId).toBe('2');
    });
  });

  describe('setActiveProject', () => {
    it('should set the active project and update lastAccessedAt', () => {
      const project = createMockProject({ id: '1', lastAccessedAt: '2024-01-01T00:00:00Z' });
      useProjectStore.getState().addProject(project);

      const before = new Date().toISOString();
      useProjectStore.getState().setActiveProject('1');

      const state = useProjectStore.getState();
      expect(state.activeProjectId).toBe('1');
      expect(state.projects[0].lastAccessedAt).toBe(state.projects[0].lastAccessedAt);
      expect(new Date(state.projects[0].lastAccessedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe('getActiveProject', () => {
    it('should return the active project', () => {
      const project = createMockProject({ id: '1' });
      useProjectStore.getState().addProject(project);
      useProjectStore.getState().setActiveProject('1');

      const active = useProjectStore.getState().getActiveProject();
      expect(active).toEqual(project);
    });

    it('should return null if no active project', () => {
      const active = useProjectStore.getState().getActiveProject();
      expect(active).toBeNull();
    });
  });
});
