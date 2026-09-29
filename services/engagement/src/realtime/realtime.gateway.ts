import { Inject, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { JwtAuthGuard } from '@mercadia/service-kit';

/**
 * Socket.IO endpoint for chat and live notifications. The browser authenticates with its
 * access token; each socket joins `user:<id>` and, for sellers, `store:<storeId>`.
 */
@WebSocketGateway({ path: '/realtime/socket.io', cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server: Server;

  constructor(@Inject(JwtAuthGuard) private readonly auth: JwtAuthGuard) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('missing token');
      const user = await this.auth.verify(token);
      socket.data.user = user;
      await socket.join(`user:${user.sub}`);
      if (user.storeId) await socket.join(`store:${user.storeId}`);
    } catch {
      socket.emit('error', 'unauthorized');
      socket.disconnect(true);
    }
  }

  toUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  toStore(storeId: string, event: string, payload: unknown) {
    this.server?.to(`store:${storeId}`).emit(event, payload);
  }

  get connections() {
    return this.server?.engine?.clientsCount ?? 0;
  }
}
