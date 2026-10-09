// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActivityMonitor, IDLE_LOCK_MS } from '@zero/main/activity';

describe('ActivityMonitor (Observer)', () => {
  let monitor: ActivityMonitor;

  beforeEach(() => {
    vi.useFakeTimers();
    monitor = new ActivityMonitor();
  });

  afterEach(() => {
    monitor.stop();
    vi.useRealTimers();
  });

  it('emite idle-timeout exatamente depois do período ocioso', () => {
    const seen: string[] = [];
    monitor.subscribe((event) => seen.push(event));

    monitor.touch();
    vi.advanceTimersByTime(IDLE_LOCK_MS - 1);
    expect(seen).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['idle-timeout']);
    // disparou uma vez: o próprio timer se desarma
    vi.advanceTimersByTime(IDLE_LOCK_MS);
    expect(seen).toHaveLength(1);
  });

  it('touch rearma o temporizador antes da ociosidade', () => {
    let fires = 0;
    monitor.subscribe(() => {
      fires += 1;
    });

    monitor.touch();
    vi.advanceTimersByTime(IDLE_LOCK_MS - 1000);
    monitor.touch();
    vi.advanceTimersByTime(IDLE_LOCK_MS - 1000);
    expect(fires).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(fires).toBe(1);
  });

  it('stop cancela o temporizador sem emitir', () => {
    const listener = vi.fn();
    monitor.subscribe(listener);

    monitor.touch();
    monitor.stop();

    vi.advanceTimersByTime(IDLE_LOCK_MS * 2);
    expect(listener).not.toHaveBeenCalled();
  });

  it('o ouvinte cancela a própria assinatura e o monitor mantém os demais', () => {
    const gone = vi.fn();
    const stays = vi.fn();
    const unsubscribe = monitor.subscribe(gone);
    monitor.subscribe(stays);

    unsubscribe();
    monitor.touch();
    vi.advanceTimersByTime(IDLE_LOCK_MS);

    expect(gone).not.toHaveBeenCalled();
    expect(stays).toHaveBeenCalledTimes(1);
  });

  it('dois ouvintes veem o mesmo evento', () => {
    const first = vi.fn();
    const second = vi.fn();
    monitor.subscribe(first);
    monitor.subscribe(second);

    monitor.touch();
    vi.advanceTimersByTime(IDLE_LOCK_MS);

    expect(first).toHaveBeenCalledWith('idle-timeout');
    expect(second).toHaveBeenCalledWith('idle-timeout');
  });
});
