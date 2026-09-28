import { Inject, Injectable } from '@nestjs/common';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { CONFIG, type IdentityConfig } from '../config.js';
import { decrypt, encrypt, randomToken, sha256 } from '../crypto.js';

/** RFC 6238 TOTP (30 s steps, ±1 step of clock drift). Secrets are encrypted at rest. */
@Injectable()
export class TotpService {
  constructor(@Inject(CONFIG) private readonly config: IdentityConfig) {}

  async createSecret(email: string) {
    const secret = generateSecret();
    const otpauthUrl = generateURI({ secret, label: email, issuer: 'Mercadia' });
    return {
      secret,
      otpauthUrl,
      qrCode: await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 }),
      encrypted: encrypt(secret, this.config.encryptionKey),
    };
  }

  async check(encryptedSecret: string, code: string): Promise<boolean> {
    if (!/^\d{6}$/.test(code)) return false;
    const secret = decrypt(encryptedSecret, this.config.encryptionKey);
    const result = await verify({ secret, token: code, epochTolerance: 30 });
    return result.valid;
  }

  /** Ten one-time recovery codes like `k3f9-x2m8`; only their hashes are stored. */
  recoveryCodes() {
    const codes = Array.from({ length: 10 }, () => {
      const raw = randomToken(6)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, 'x')
        .slice(0, 8);
      return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    });
    return { codes, hashes: codes.map((c) => sha256(c)) };
  }
}
