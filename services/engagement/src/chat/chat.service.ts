import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { AuthUser } from '@mercadia/service-kit';
import { ServiceClients } from '../clients/clients.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeGateway } from '../realtime/realtime.gateway.js';
import { Conversation, Message, StoreOwner } from '../schemas.js';

/** Buyer ↔ seller conversations (optionally about a product), delivered live over Socket.IO. */
@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name) private readonly conversations: Model<Conversation>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    @InjectModel(StoreOwner.name) private readonly stores: Model<StoreOwner>,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly clients: ServiceClients,
  ) {}

  private async access(id: string, user: AuthUser) {
    const conversation = await this.conversations.findById(id);
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.buyerId === user.sub) return { conversation, role: 'buyer' as const };
    if (conversation.storeId === user.storeId) return { conversation, role: 'seller' as const };
    throw new ForbiddenException();
  }

  async start(user: AuthUser, input: { storeId: string; productId?: string; text: string }) {
    const store = await this.stores.findById(input.storeId).lean();
    if (!store) throw new NotFoundException('Store not found');
    if (store.ownerId === user.sub)
      throw new ForbiddenException('You cannot message your own store');
    const product = input.productId
      ? (await this.clients.products([input.productId]))[0]
      : undefined;
    const conversation = await this.conversations.findOneAndUpdate(
      { buyerId: user.sub, storeId: store._id, productId: product?.id ?? null },
      {
        $setOnInsert: {
          buyerName: user.name,
          storeName: store.name,
          productTitle: product?.title ?? null,
          productImage: product?.image ?? null,
        },
      },
      { upsert: true, new: true },
    );
    return this.send(conversation._id, user, input.text);
  }

  async send(id: string, user: AuthUser, text: string) {
    const { conversation, role } = await this.access(id, user);
    const message = await this.messages.create({
      conversationId: id,
      senderId: user.sub,
      senderRole: role,
      text: text.trim(),
    });
    conversation.lastMessage = message.text.slice(0, 140);
    conversation.lastAt = message.createdAt;
    if (role === 'buyer') conversation.unreadSeller += 1;
    else conversation.unreadBuyer += 1;
    await conversation.save();

    const payload = { conversation: conversation.toObject(), message: message.toObject() };
    if (role === 'buyer') {
      this.realtime.toStore(conversation.storeId, 'message', payload);
      const store = await this.stores.findById(conversation.storeId).lean();
      if (store)
        await this.notifications.notify(
          store.ownerId,
          'new_message',
          { from: conversation.buyerName },
          `/messages/${id}`,
        );
    } else {
      this.realtime.toUser(conversation.buyerId, 'message', payload);
      await this.notifications.notify(
        conversation.buyerId,
        'new_message',
        { from: conversation.storeName },
        `/messages/${id}`,
      );
    }
    this.realtime.toUser(user.sub, 'message', payload);
    return payload;
  }

  async list(user: AuthUser, as: 'buyer' | 'seller') {
    const filter = as === 'seller' ? { storeId: user.storeId ?? '-' } : { buyerId: user.sub };
    return this.conversations.find(filter).sort({ lastAt: -1 }).limit(50).lean();
  }

  async history(id: string, user: AuthUser) {
    const { conversation, role } = await this.access(id, user);
    await this.conversations.updateOne(
      { _id: id },
      role === 'buyer' ? { unreadBuyer: 0 } : { unreadSeller: 0 },
    );
    const messages = await this.messages
      .find({ conversationId: id })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();
    return { conversation: conversation.toObject(), role, messages };
  }
}
