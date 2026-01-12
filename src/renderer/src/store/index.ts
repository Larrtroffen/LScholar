import { useConfigStore } from './config';
import { useDataStore } from './data';
import { useTaskStore } from './task';

export { useConfigStore, useDataStore, useTaskStore };

// Re-export for backward compatibility if needed, or just use the new stores directly in components.
// Ideally, we should update components to use the specific stores.
