import { saveTextFile } from './download';

function stubUrl() {
  URL.createObjectURL = vi.fn(() => 'blob:file');
  URL.revokeObjectURL = vi.fn();
}
function spyClicks() {
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  return clicked;
}
function setNav(props: Record<string, unknown>) {
  for (const [k, v] of Object.entries(props)) Object.defineProperty(navigator, k, { value: v, configurable: true });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const k of ['maxTouchPoints', 'canShare', 'share']) delete (navigator as unknown as Record<string, unknown>)[k];
});

describe('saveTextFile', () => {
  it('downloads through a link and revokes the URL later, not straight away', async () => {
    vi.useFakeTimers();
    stubUrl();
    const clicked = spyClicks();
    await saveTextFile('backup.json', '{"a":1}');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('backup.json');
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:file');
  });

  it('uses the share sheet on a touch device that can share files', async () => {
    stubUrl();
    const clicked = spyClicks();
    const share = vi.fn(async () => {});
    setNav({ maxTouchPoints: 5, canShare: () => true, share });
    await saveTextFile('backup.json', 'hello');
    expect(share).toHaveBeenCalledTimes(1);
    const arg = (share.mock.calls[0] as unknown as [{ files: File[] }])[0];
    expect(arg.files[0].name).toBe('backup.json');
    expect(await arg.files[0].text()).toBe('hello');
    expect(clicked).toHaveLength(0);
  });

  it('treats cancelling the share sheet as done, with no download', async () => {
    stubUrl();
    const clicked = spyClicks();
    setNav({
      maxTouchPoints: 5,
      canShare: () => true,
      share: vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      }),
    });
    await saveTextFile('backup.json', 'x');
    expect(clicked).toHaveLength(0);
  });

  it('falls back to a download when sharing fails', async () => {
    stubUrl();
    const clicked = spyClicks();
    setNav({
      maxTouchPoints: 5,
      canShare: () => true,
      share: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    await saveTextFile('backup.json', 'x');
    expect(clicked).toHaveLength(1);
  });

  it('downloads rather than shares on a non-touch device', async () => {
    stubUrl();
    const clicked = spyClicks();
    const share = vi.fn(async () => {});
    setNav({ maxTouchPoints: 0, canShare: () => true, share });
    await saveTextFile('backup.json', 'x');
    expect(share).not.toHaveBeenCalled();
    expect(clicked).toHaveLength(1);
  });
});
