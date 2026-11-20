import { renderHook } from '@testing-library/react';
import { useWakeLock } from './useWakeLock';

function installWakeLock() {
  const sentinel = {
    released: false,
    release: vi.fn(async () => {
      sentinel.released = true;
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const request = vi.fn(async () => {
    sentinel.released = false;
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
  return { sentinel, request };
}

afterEach(() => {
  delete (navigator as { wakeLock?: unknown }).wakeLock;
});

describe('useWakeLock', () => {
  it('requests a screen lock while active and releases it on unmount', async () => {
    const { sentinel, request } = installWakeLock();
    const { unmount } = renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    unmount();
    await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalled());
  });

  it('does nothing while inactive', () => {
    const { request } = installWakeLock();
    renderHook(() => useWakeLock(false));
    expect(request).not.toHaveBeenCalled();
  });

  it('releases when it becomes inactive', async () => {
    const { sentinel, request } = installWakeLock();
    const { rerender } = renderHook(({ on }) => useWakeLock(on), { initialProps: { on: true } });
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
    rerender({ on: false });
    await vi.waitFor(() => expect(sentinel.release).toHaveBeenCalled());
  });

  it('asks again when the page becomes visible after the system released the lock', async () => {
    const { sentinel, request } = installWakeLock();
    renderHook(() => useWakeLock(true));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    sentinel.released = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('does not throw where the Wake Lock API is missing', () => {
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
  });

  it('swallows a rejected request', async () => {
    const request = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    expect(() => renderHook(() => useWakeLock(true))).not.toThrow();
    await vi.waitFor(() => expect(request).toHaveBeenCalled());
  });
});
