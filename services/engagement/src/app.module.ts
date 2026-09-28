import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { getConnectionToken, MongooseModule } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import {
  AuthModule,
  EventBusModule,
  HealthModule,
  HealthRegistry,
  loggingModule,
} from '@mercadia/service-kit';
import { ChatController } from './chat/chat.controller.js';
import { ChatService } from './chat/chat.service.js';
import { ServiceClients } from './clients/clients.js';
import { config } from './config.js';
import { ConfigModule } from './config.module.js';
import { EventNotifications } from './notifications/event-notifications.js';
import { Mailer } from './notifications/mailer.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { RealtimeGateway } from './realtime/realtime.gateway.js';
import { ReviewsController } from './reviews/reviews.controller.js';
import { ReviewsService } from './reviews/reviews.service.js';
import {
  Conversation,
  ConversationSchema,
  Message,
  MessageSchema,
  Notification,
  NotificationSchema,
  Review,
  ReviewSchema,
  StoreOwner,
  StoreOwnerSchema,
  WishlistItem,
  WishlistItemSchema,
} from './schemas.js';
import { SeedService } from './seed/seed.service.js';
import { WishlistController } from './wishlist/wishlist.controller.js';

const settings = config();

@Module({
  imports: [
    loggingModule('engagement'),
    ConfigModule,
    HealthModule,
    MongooseModule.forRoot(settings.mongoUri, { dbName: settings.mongoDb }),
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: StoreOwner.name, schema: StoreOwnerSchema },
      { name: Conversation.name, schema: ConversationSchema },
      { name: Message.name, schema: MessageSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: WishlistItem.name, schema: WishlistItemSchema },
    ]),
    EventBusModule.forRoot({
      service: 'engagement',
      redisUrl: settings.redisUrl,
      consume: settings.consumeEvents,
    }),
    AuthModule.forRoot({ jwksUrl: settings.jwksUrl, internalKey: settings.internalKey }),
  ],
  controllers: [ReviewsController, ChatController, NotificationsController, WishlistController],
  providers: [
    ServiceClients,
    Mailer,
    RealtimeGateway,
    NotificationsService,
    ReviewsService,
    ChatService,
    EventNotifications,
    SeedService,
  ],
})
export class AppModule implements OnModuleInit {
  constructor(
    @Inject(getConnectionToken()) private readonly connection: Connection,
    private readonly health: HealthRegistry,
  ) {}

  onModuleInit() {
    this.health.add('mongodb', () => this.connection.db!.admin().ping());
  }
}
