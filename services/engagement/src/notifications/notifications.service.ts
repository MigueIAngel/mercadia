import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { ServiceClients } from '../clients/clients.js';
import { CONFIG, type EngagementConfig } from '../config.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { Notification } from '../schemas.js';
import { Mailer } from './mailer.js';

type Params = Record<string, string | number>;

/** Short email copy per notification type, in both languages. */
const EMAIL: Record<string, { es: [string, string]; en: [string, string] }> = {
  order_paid: {
    es: [
      'Pago confirmado',
      'Recibimos el pago de tu pedido #{number}. Los vendedores ya lo están preparando.',
    ],
    en: [
      'Payment confirmed',
      'We received the payment for order #{number}. The sellers are preparing it.',
    ],
  },
  order_shipped: {
    es: ['Tu pedido va en camino', 'Tu pedido #{number} de {store} salió con la guía {tracking}.'],
    en: [
      'Your order is on its way',
      'Order #{number} from {store} shipped with tracking {tracking}.',
    ],
  },
  order_delivered: {
    es: [
      'Pedido entregado',
      'Tu pedido #{number} de {store} fue entregado. ¡Cuéntanos qué te pareció!',
    ],
    en: ['Order delivered', 'Order #{number} from {store} was delivered. Tell us what you think!'],
  },
  order_cancelled: {
    es: [
      'Pedido cancelado',
      'Tu pedido #{number} fue cancelado. Si ya habías pagado, el reembolso está en camino.',
    ],
    en: [
      'Order cancelled',
      'Order #{number} was cancelled. If you had paid, the refund is on its way.',
    ],
  },
  price_drop: {
    es: ['¡Bajó de precio!', '{title} de tu lista de favoritos bajó de precio.'],
    en: ['Price drop!', '{title} from your wishlist is cheaper now.'],
  },
  refund: {
    es: ['Reembolso aprobado', 'Aprobamos un reembolso de tu pedido #{number}.'],
    en: ['Refund approved', 'We approved a refund for order #{number}.'],
  },
  welcome: {
    es: ['Bienvenido a Mercadia', 'Hola {name}, ya puedes comprar a tiendas de todo el país.'],
    en: ['Welcome to Mercadia', 'Hi {name}, you can now shop from stores all over the country.'],
  },
};

const fill = (text: string, params: Params) =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @Inject(CONFIG) private readonly config: EngagementConfig,
    private readonly realtime: RealtimeGateway,
    private readonly mailer: Mailer,
    private readonly clients: ServiceClients,
  ) {}

  /** Stores the notification, pushes it live and (optionally) emails it. */
  async notify(userId: string, type: string, params: Params, link: string, email = false) {
    const doc = await this.notifications.create({ userId, type, params, link });
    this.realtime.toUser(userId, 'notification', doc.toObject());
    if (email && EMAIL[type]) {
      const [contact] = await this.clients.contacts([userId]);
      if (contact) {
        const copy = EMAIL[type][contact.locale === 'en' ? 'en' : 'es'];
        const params2 = { name: contact.name.split(' ')[0], ...params };
        await this.mailer.send(
          contact.email,
          fill(copy[0], params2),
          fill(copy[0], params2),
          fill(copy[1], params2),
          {
            label: contact.locale === 'en' ? 'Open Mercadia' : 'Ir a Mercadia',
            url: `${this.config.siteUrl}/${contact.locale === 'en' ? 'en' : 'es'}${link}`,
          },
        );
      }
    }
    return doc;
  }

  list(userId: string) {
    return this.notifications.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
  }

  async unread(userId: string) {
    return { count: await this.notifications.countDocuments({ userId, read: false }) };
  }

  async markRead(userId: string, ids?: string[]) {
    await this.notifications.updateMany(
      { userId, ...(ids?.length && { _id: { $in: ids } }) },
      { read: true },
    );
  }
}
