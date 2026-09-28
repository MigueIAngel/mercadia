import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { BUYERS, demoProducts, demoReviews, STORES } from '@mercadia/demo-data';
import { CONFIG, type EngagementConfig } from '../config.js';
import { Conversation, Message, Notification, Review, StoreOwner } from '../schemas.js';

/** Imported reviews, store owners and a conversation so the demo has activity. */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
    @InjectModel(StoreOwner.name) private readonly stores: Model<StoreOwner>,
    @InjectModel(Conversation.name) private readonly conversations: Model<Conversation>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
    @Inject(CONFIG) private readonly config: EngagementConfig,
  ) {}

  async onApplicationBootstrap() {
    if (this.config.seed) await this.seed();
  }

  async seed() {
    if ((await this.stores.estimatedDocumentCount()) === 0) {
      await this.stores.insertMany(
        STORES.map((s) => ({ _id: s.id, ownerId: s.ownerId, name: s.name, slug: s.slug })),
      );
    }
    if ((await this.reviews.estimatedDocumentCount()) > 0) return;
    await this.reviews.insertMany(
      demoReviews().map((r) => ({
        _id: r.id,
        productId: r.productId,
        storeId: r.storeId,
        authorId: null,
        authorName: r.authorName,
        rating: r.rating,
        comment: r.comment,
        verified: true,
        createdAt: new Date(r.createdAt),
      })),
    );
    // One conversation between the demo buyer and TecnoNova about a phone.
    const buyer = BUYERS[0];
    const store = STORES[0];
    const product = demoProducts().find((p) => p.storeId === store.id)!;
    const conversation = await this.conversations.create({
      buyerId: buyer.id,
      buyerName: buyer.name,
      storeId: store.id,
      storeName: store.name,
      productId: product.id,
      productTitle: product.title,
      productImage: product.images[0],
      lastMessage: '¡Hola Laura! Sí, viene con cargador original y garantía de 1 año.',
      unreadBuyer: 1,
    });
    await this.messages.insertMany([
      {
        conversationId: conversation._id,
        senderId: buyer.id,
        senderRole: 'buyer',
        text: `Hola, ¿el ${product.title} trae cargador y garantía?`,
      },
      {
        conversationId: conversation._id,
        senderId: store.ownerId,
        senderRole: 'seller',
        text: '¡Hola Laura! Sí, viene con cargador original y garantía de 1 año.',
      },
    ]);
    await this.notifications.create({
      userId: buyer.id,
      type: 'new_message',
      params: { from: store.name },
      link: `/messages/${conversation._id}`,
    });
    this.logger.log('demo reviews and conversations loaded');
  }
}
