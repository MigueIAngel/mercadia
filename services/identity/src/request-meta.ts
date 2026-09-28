import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestMeta } from './audit/audit.service.js';

/**
 * Client IP and user agent. The web app forwards the browser's values in
 * `x-client-ip` / `x-client-user-agent` because it calls the API from its server.
 */
export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest();
  const forwardedIp = req.headers['x-client-ip'];
  const forwardedAgent = req.headers['x-client-user-agent'];
  return {
    ip: (typeof forwardedIp === 'string' ? forwardedIp : req.ip)?.slice(0, 64),
    userAgent: typeof forwardedAgent === 'string' ? forwardedAgent : req.headers['user-agent'],
  };
});
