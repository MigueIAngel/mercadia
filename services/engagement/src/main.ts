import 'reflect-metadata';
import { startService } from '@mercadia/service-kit';
import { AppModule } from './app.module.js';
import { config } from './config.js';

export function startEngagement() {
  return startService(AppModule, {
    name: 'engagement',
    port: config().port,
    title: 'Engagement service',
    description:
      'Verified-purchase reviews with store reputation and seller replies, real-time buyer–seller ' +
      'chat (Socket.IO at /realtime/socket.io), in-app and email notifications for every step of ' +
      'an order, and wishlists with price-drop alerts.',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) await startEngagement();
