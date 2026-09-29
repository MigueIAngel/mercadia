import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { decodeJwt } from 'jose';
import { createHash } from 'node:crypto';
import { generate } from 'otplib';
import request from 'supertest';
import { resetDatabase } from './setup-env.js';

describe('Identity service (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  const register = (email: string, password = 'Secreta123') =>
    http().post('/auth/register').send({ email, password, name: 'Test User' });

  const login = (email: string, password: string) =>
    http().post('/auth/login').send({ email, password });

  beforeAll(async () => {
    await resetDatabase();
    const { AppModule } = await import('../src/app.module.js');
    const { configureService } = await import('@mercadia/service-kit');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureService(app, { name: 'identity', port: 0, title: 'Identity', description: '' });
    await app.init();
    const { LoginThrottleService } = await import('../src/auth/login-throttle.service.js');
    await app.get(LoginThrottleService).redis.flushdb();
  });

  afterAll(() => app?.close());

  describe('registration and login', () => {
    it('registers a buyer and returns tokens', async () => {
      const res = await register('new@example.com').expect(201);
      expect(res.body.user).toMatchObject({
        email: 'new@example.com',
        roles: ['buyer'],
        store: null,
      });
      expect(res.body.accessToken.split('.')).toHaveLength(3);
    });

    it('rejects duplicate emails regardless of case', async () => {
      await register('NEW@example.com').expect(409);
    });

    it('rejects weak passwords', async () => {
      await register('weak@example.com', 'password').expect(400);
    });

    it('logs in the seeded demo buyer', async () => {
      const res = await login('laura@mercadia.dev', 'Mercadia2026!').expect(200);
      expect(res.body.user.name).toBe('Laura Gómez');
    });

    it('uses the same error for unknown emails and wrong passwords', async () => {
      const a = await login('nobody@example.com', 'Whatever1').expect(401);
      const b = await login('laura@mercadia.dev', 'Wrong1234').expect(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('locks an account after 5 failed attempts', async () => {
      await register('locked@example.com').expect(201);
      for (let i = 0; i < 5; i++) await login('locked@example.com', 'Wrong1234').expect(401);
      await login('locked@example.com', 'Secreta123').expect(429);
    });
  });

  describe('sessions', () => {
    it('rotates refresh tokens and revokes the family on reuse', async () => {
      const { body: first } = await login('andres@mercadia.dev', 'Mercadia2026!').expect(200);
      const { body: second } = await http()
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(second.refreshToken).not.toBe(first.refreshToken);

      // An attacker replays the old token: the whole session dies, including the new token.
      await http().post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
      await http().post('/auth/refresh').send({ refreshToken: second.refreshToken }).expect(401);

      const log = await http()
        .get('/users/me/security-log')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(200);
      expect(log.body.map((e: { action: string }) => e.action)).toContain('refresh_reuse_detected');
    });

    it('lists and revokes sessions', async () => {
      const { body } = await login('sofia@mercadia.dev', 'Mercadia2026!').expect(200);
      const auth = { Authorization: `Bearer ${body.accessToken}` };
      const sessions = await http().get('/users/me/sessions').set(auth).expect(200);
      expect(sessions.body.length).toBeGreaterThan(0);
      await http().delete(`/users/me/sessions/${sessions.body[0].familyId}`).set(auth).expect(204);
      await http().post('/auth/refresh').send({ refreshToken: body.refreshToken }).expect(401);
    });

    it('logs out', async () => {
      const { body } = await register('logout@example.com').expect(201);
      await http().post('/auth/logout').send({ refreshToken: body.refreshToken }).expect(204);
      await http().post('/auth/refresh').send({ refreshToken: body.refreshToken }).expect(401);
    });
  });

  describe('two-factor authentication', () => {
    it('enrols TOTP, then requires the code at login, and accepts recovery codes once', async () => {
      const { body } = await register('mfa@example.com').expect(201);
      const auth = { Authorization: `Bearer ${body.accessToken}` };

      const setup = await http().post('/auth/2fa/setup').set(auth).expect(201);
      expect(setup.body.qrCode).toMatch(/^data:image\/png;base64,/);
      await http().post('/auth/2fa/enable').set(auth).send({ code: '000000' }).expect(400);
      const enabled = await http()
        .post('/auth/2fa/enable')
        .set(auth)
        .send({ code: await generate({ secret: setup.body.secret }) })
        .expect(200);
      expect(enabled.body.recoveryCodes).toHaveLength(10);

      const step1 = await login('mfa@example.com', 'Secreta123').expect(200);
      expect(step1.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
      expect(step1.body.accessToken).toBeUndefined();

      await http()
        .post('/auth/login/2fa')
        .send({ mfaToken: step1.body.mfaToken, code: '123456' })
        .expect(401);
      const ok = await http()
        .post('/auth/login/2fa')
        .send({
          mfaToken: step1.body.mfaToken,
          code: await generate({ secret: setup.body.secret }),
        })
        .expect(200);
      expect(ok.body.user.totpEnabled).toBe(true);

      const recovery = enabled.body.recoveryCodes[0];
      await http()
        .post('/auth/login/2fa')
        .send({ mfaToken: step1.body.mfaToken, code: recovery })
        .expect(200);
      await http()
        .post('/auth/login/2fa')
        .send({ mfaToken: step1.body.mfaToken, code: recovery })
        .expect(401);
    });
  });

  describe('stores and roles', () => {
    it('lets a buyer open a store and returns tokens with the seller role', async () => {
      const { body } = await register('seller@example.com').expect(201);
      const res = await http()
        .post('/stores')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ name: 'Café de la Sierra', city: 'Santa Marta' })
        .expect(201);
      expect(res.body.user.roles).toEqual(['buyer', 'seller']);
      expect(res.body.user.store.slug).toBe('cafe-de-la-sierra');

      const mine = await http()
        .get('/stores/mine')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .expect(200);
      expect(mine.body.name).toBe('Café de la Sierra');
      await http()
        .post('/stores')
        .set('Authorization', `Bearer ${res.body.accessToken}`)
        .send({ name: 'Otra' })
        .expect(409);
    });

    it('serves public store pages', async () => {
      const res = await http().get('/stores/tecnonova').expect(200);
      expect(res.body).toMatchObject({
        name: 'TecnoNova',
        city: 'Bogotá',
        ownerName: 'Camilo Restrepo',
      });
      expect((await http().get('/stores').expect(200)).body.length).toBeGreaterThanOrEqual(8);
    });

    it('restricts the admin API to admins', async () => {
      const buyer = await http().post('/auth/demo').send({ role: 'buyer' }).expect(200);
      await http()
        .get('/admin/users')
        .set('Authorization', `Bearer ${buyer.body.accessToken}`)
        .expect(403);

      const admin = await http().post('/auth/demo').send({ role: 'admin' }).expect(200);
      const users = await http()
        .get('/admin/users?search=laura')
        .set('Authorization', `Bearer ${admin.body.accessToken}`)
        .expect(200);
      expect(users.body[0].email).toBe('laura@mercadia.dev');
    });

    it('suspends accounts and kills their sessions', async () => {
      const victim = await register('suspend@example.com').expect(201);
      const admin = await http().post('/auth/demo').send({ role: 'admin' }).expect(200);
      await http()
        .patch(`/admin/users/${victim.body.user.id}`)
        .set('Authorization', `Bearer ${admin.body.accessToken}`)
        .send({ status: 'suspended' })
        .expect(200);
      await http()
        .post('/auth/refresh')
        .send({ refreshToken: victim.body.refreshToken })
        .expect(401);
      await login('suspend@example.com', 'Secreta123').expect(403);
    });
  });

  describe('profile photo', () => {
    it('signs direct uploads and accepts only photos from our cloud', async () => {
      const { body } = await register('photo@example.com').expect(201);
      const auth = { Authorization: `Bearer ${body.accessToken}` };
      const sig = await http().post('/users/me/avatar/signature').set(auth).expect(200);
      expect(sig.body).toMatchObject({
        url: 'https://api.cloudinary.com/v1_1/democloud/image/upload',
        apiKey: '123456',
        folder: 'mercadia/avatars',
        public_id: body.user.id,
      });
      const expected = createHash('sha1')
        .update(
          `folder=mercadia/avatars&overwrite=true&public_id=${body.user.id}&timestamp=${sig.body.timestamp}cloud-secret`,
        )
        .digest('hex');
      expect(sig.body.signature).toBe(expected);

      for (const avatarUrl of [
        'http://res.cloudinary.com/democloud/image/upload/a.jpg',
        'https://evil.example.com/a.jpg',
        'https://res.cloudinary.com/othercloud/image/upload/a.jpg',
      ]) {
        await http().patch('/users/me').set(auth).send({ avatarUrl }).expect(400);
      }
      const photo = `https://res.cloudinary.com/democloud/image/upload/v1/mercadia/avatars/${body.user.id}.jpg`;
      const updated = await http().patch('/users/me').set(auth).send({ avatarUrl: photo });
      expect(updated.status).toBe(200);
      expect(updated.body.avatarUrl).toBe(photo);

      // The next access token carries the photo, so the header can show it.
      const refreshed = await http()
        .post('/auth/refresh')
        .send({ refreshToken: body.refreshToken })
        .expect(200);
      expect(decodeJwt(refreshed.body.accessToken).picture).toBe(photo);

      const removed = await http().patch('/users/me').set(auth).send({ avatarUrl: null });
      expect(removed.body.avatarUrl).toBeNull();
    });
  });

  describe('service to service', () => {
    it('exposes the JWKS publicly', async () => {
      const res = await http().get('/.well-known/jwks.json').expect(200);
      expect(res.body.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
    });

    it('protects the internal lookup with the shared key', async () => {
      await http().post('/users/internal/lookup').send({ ids: [] }).expect(403);
      const res = await http()
        .post('/users/internal/lookup')
        .set('x-internal-key', 'dev-internal-key')
        .send({ ids: ['4f5a5a4e-0000-5000-8000-000000000000'] })
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });
});
