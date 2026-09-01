import {
  ensureFileReadPermission,
  ensureFileDeletePermission,
  ensureFileWritePermission,
  ensurePluginPermission,
  FILE_READ_PERMISSION,
  FILE_DELETE_PERMISSION,
  FILE_WRITE_PERMISSION,
} from './pluginPermissions';
import { PluginManager } from 'sn-plugin-lib';

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    hasPermission: jest.fn(),
    requestPermission: jest.fn(),
  },
}));

const manager = PluginManager as jest.Mocked<typeof PluginManager>;

describe('plugin permissions', () => {
  beforeEach(() => {
    manager.hasPermission.mockReset();
    manager.requestPermission.mockReset();
  });

  test('does not prompt when access is already granted', async () => {
    manager.hasPermission.mockResolvedValue(1);

    await expect(ensureFileReadPermission()).resolves.toBe(true);
    expect(manager.hasPermission).toHaveBeenCalledWith(FILE_READ_PERMISSION);
    expect(manager.requestPermission).not.toHaveBeenCalled();
  });

  test('requests permission when it has not been granted', async () => {
    manager.hasPermission.mockResolvedValue(0);
    manager.requestPermission.mockResolvedValue(1);

    await expect(ensureFileReadPermission()).resolves.toBe(true);
    expect(manager.requestPermission).toHaveBeenCalledWith(
      FILE_READ_PERMISSION,
      expect.stringContaining('PARA'),
    );
  });

  test('describes write access as note creation rather than only PARA storage', async () => {
    manager.hasPermission.mockResolvedValue(0);
    manager.requestPermission.mockResolvedValue(1);

    await expect(ensureFileWritePermission()).resolves.toBe(true);
    expect(manager.requestPermission).toHaveBeenCalledWith(
      FILE_WRITE_PERMISSION,
      expect.stringContaining('journal'),
    );
  });

  test('describes delete access as required for explicit archive folder moves', async () => {
    manager.hasPermission.mockResolvedValue(0);
    manager.requestPermission.mockResolvedValue(1);

    await expect(ensureFileDeletePermission()).resolves.toBe(true);
    expect(manager.requestPermission).toHaveBeenCalledWith(
      FILE_DELETE_PERMISSION,
      expect.stringContaining('does not delete the folder contents'),
    );
  });

  test('fails safely when permission is denied', async () => {
    manager.hasPermission.mockResolvedValue(0);
    manager.requestPermission.mockResolvedValue(0);

    await expect(ensureFileReadPermission()).resolves.toBe(false);
  });

  test('coalesces simultaneous requests for the same permission', async () => {
    let resolveRequest: (value: number) => void = () => undefined;
    manager.hasPermission.mockResolvedValue(0);
    manager.requestPermission.mockReturnValue(
      new Promise<number>(resolve => {
        resolveRequest = resolve;
      }),
    );

    const first = ensurePluginPermission(FILE_READ_PERMISSION, 'first');
    const second = ensurePluginPermission(FILE_READ_PERMISSION, 'second');
    await Promise.resolve();
    await Promise.resolve();
    resolveRequest(1);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(manager.requestPermission).toHaveBeenCalledTimes(1);
  });
});
