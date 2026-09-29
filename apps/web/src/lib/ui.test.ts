import { describe, expect, it, vi } from 'vitest';
import { brandOf, expiryOf } from '@/components/payments/CardFace';
import { avatarSrc } from '@/components/ui/Avatar';
import { toast, useToasts } from './toast';

describe('card helpers', () => {
  it('detects the brand from the first digits', () => {
    expect(brandOf('4242 4242')).toBe('visa');
    expect(brandOf('5555')).toBe('mastercard');
    expect(brandOf('2223 0000')).toBe('mastercard');
    expect(brandOf('3782')).toBe('amex');
    expect(brandOf('6011')).toBe('card');
  });

  it('formats the expiry as MM/YY', () => {
    expect(expiryOf({ expMonth: 3, expYear: 2031 })).toBe('03/31');
  });
});

describe('avatarSrc', () => {
  it('asks Cloudinary for a face-centred square at double density', () => {
    expect(
      avatarSrc('https://res.cloudinary.com/demo/image/upload/v1/mercadia/avatars/u.jpg', 40),
    ).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_fill,g_face,w_80,h_80,q_auto,f_auto/v1/mercadia/avatars/u.jpg',
    );
  });

  it('leaves other URLs alone', () => {
    const google = 'https://lh3.googleusercontent.com/a/photo';
    expect(avatarSrc(google, 40)).toBe(google);
  });
});

describe('toasts', () => {
  it('keeps at most four and dismisses them on a timer', () => {
    vi.useFakeTimers();
    for (let i = 0; i < 6; i++) toast.info(`m${i}`);
    expect(useToasts.getState().toasts.map((t) => t.message)).toEqual(['m2', 'm3', 'm4', 'm5']);
    vi.advanceTimersByTime(4000);
    expect(useToasts.getState().toasts).toEqual([]);
    vi.useRealTimers();
  });
});
