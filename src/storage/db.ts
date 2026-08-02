import { LabProject } from '../types';

const DB_NAME = 'MikroLabDB';
const DB_VERSION = 2;
const STORE_PROJECTS = 'projects';
const STORE_DEVICE_CONFIGS = 'device_configs';
const TUTORIAL_KEY = 'mikrolab_seen_tutorial';

export class StorageEngine {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains(STORE_DEVICE_CONFIGS)) {
            db.createObjectStore(STORE_DEVICE_CONFIGS, { keyPath: 'id' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  public static async saveProject(project: LabProject): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_PROJECTS, 'readwrite');
      const store = tx.objectStore(STORE_PROJECTS);
      store.put({ id: 'current_lab', project, updatedAt: new Date().toISOString() });
    } catch {
      localStorage.setItem('mikrolab_current_project', JSON.stringify(project));
    }
  }

  public static async loadProject(): Promise<LabProject | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const store = tx.objectStore(STORE_PROJECTS);
      return new Promise((resolve) => {
        const req = store.get('current_lab');
        req.onsuccess = () => {
          if (req.result && req.result.project) {
            resolve(req.result.project);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      const fallback = localStorage.getItem('mikrolab_current_project');
      return fallback ? JSON.parse(fallback) : null;
    }
  }

  public static exportProjectAsFile(project: LabProject): void {
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.metadata.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.mlab`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public static parseProjectFile(file: File): Promise<LabProject> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          if (!parsed.nodes || !parsed.edges) {
            throw new Error('Invalid .mlab format: Missing topology nodes/edges');
          }
          resolve(parsed as LabProject);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  /** Persist CLI-configured per-node state (IPs/routes/BGP) across refreshes. */
  public static async saveDeviceConfigs(configs: Record<string, any>): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_DEVICE_CONFIGS, 'readwrite');
      const store = tx.objectStore(STORE_DEVICE_CONFIGS);
      store.put({ id: 'current_lab', configs, updatedAt: new Date().toISOString() });
    } catch {
      localStorage.setItem('mikrolab_current_device_configs', JSON.stringify(configs));
    }
  }

  public static async loadDeviceConfigs(): Promise<Record<string, any> | null> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_DEVICE_CONFIGS, 'readonly');
      const store = tx.objectStore(STORE_DEVICE_CONFIGS);
      return new Promise((resolve) => {
        const req = store.get('current_lab');
        req.onsuccess = () => {
          if (req.result && req.result.configs) {
            resolve(req.result.configs);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      const fallback = localStorage.getItem('mikrolab_current_device_configs');
      return fallback ? JSON.parse(fallback) : null;
    }
  }

  public static async clearDeviceConfigs(): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction(STORE_DEVICE_CONFIGS, 'readwrite');
      tx.objectStore(STORE_DEVICE_CONFIGS).delete('current_lab');
    } catch {
      localStorage.removeItem('mikrolab_current_device_configs');
    }
  }

  public static hasSeenTutorial(): boolean {
    return localStorage.getItem(TUTORIAL_KEY) === 'true';
  }

  public static setTutorialSeen(seen: boolean): void {
    if (seen) {
      localStorage.setItem(TUTORIAL_KEY, 'true');
    } else {
      localStorage.removeItem(TUTORIAL_KEY);
    }
  }
}
