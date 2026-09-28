import { LoggerModule } from 'nestjs-pino';

/** JSON logs with request ids; OpenTelemetry adds trace ids when tracing is enabled. */
export function loggingModule(service: string) {
  return LoggerModule.forRoot({
    pinoHttp: {
      name: service,
      level: process.env.LOG_LEVEL ?? 'info',
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      autoLogging: { ignore: (req) => ['/health', '/metrics'].includes(req.url ?? '') },
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-internal-key"]'],
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    },
  });
}
