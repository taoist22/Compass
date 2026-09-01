import { PluginManager } from 'sn-plugin-lib';

export const FILE_READ_PERMISSION = 'plugin.permission.FILE:READ';
export const FILE_WRITE_PERMISSION = 'plugin.permission.FILE:WRITE';
export const FILE_DELETE_PERMISSION = 'plugin.permission.FILE:DELETE';
export const INTERNET_PERMISSION = 'plugin.permission.INTERNET';

const pendingRequests = new Map<string, Promise<boolean>>();

/**
 * The current Supernote OS requires plugins to request access before touching
 * shared storage. Older firmware does not expose these methods, so retain the
 * former behaviour there.
 */
export async function ensurePluginPermission(
  permission: string,
  description: string,
): Promise<boolean> {
  const manager = PluginManager as typeof PluginManager & {
    hasPermission?: (name: string) => Promise<number>;
    requestPermission?: (name: string, desc?: string) => Promise<number>;
  };

  if (
    typeof manager?.hasPermission !== 'function' ||
    typeof manager?.requestPermission !== 'function'
  ) {
    return true;
  }

  const existing = pendingRequests.get(permission);
  if (existing) return existing;

  const request = (async () => {
    try {
      if (Number(await manager.hasPermission(permission)) > 0) return true;
      return Number(await manager.requestPermission(permission, description)) > 0;
    } catch (e) {
      return false;
    }
  })();

  pendingRequests.set(permission, request);
  try {
    return await request;
  } finally {
    pendingRequests.delete(permission);
  }
}

export function ensureFileReadPermission(): Promise<boolean> {
  return ensurePluginPermission(
    FILE_READ_PERMISSION,
    'Allow SNFolio to find and open journal, event, and PARA workspace files.',
  );
}

export function ensureFileWritePermission(): Promise<boolean> {
  return ensurePluginPermission(
    FILE_WRITE_PERMISSION,
    'Allow SNFolio to create journal, event, and PARA workspace notes.',
  );
}

export function ensureFileDeletePermission(): Promise<boolean> {
  return ensurePluginPermission(
    FILE_DELETE_PERMISSION,
    'Allow SNFolio to move a folder by removing its old path. Moving does not delete the folder contents.',
  );
}

export function ensureInternetPermission(): Promise<boolean> {
  return ensurePluginPermission(
    INTERNET_PERMISSION,
    'Allow SNFolio to synchronize configured calendars, feeds, and task accounts.',
  );
}
