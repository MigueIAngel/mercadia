import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';

const id = { type: String, default: () => randomUUID() };

@Schema({ _id: false })
export class SellerReply {
  @Prop({ required: true }) text: string;
  @Prop({ default: () => new Date() }) at: Date;
}

@Schema({ collection: 'reviews', timestamps: true })
export class Review {
  @Prop(id) _id: string;
  @Prop({ required: true, index: true }) productId: string;
  @Prop({ required: true, index: true }) storeId: string;
  /** Null for imported demo reviews. */
  @Prop({ type: String, default: null }) authorId: string | null;
  @Prop({ required: true }) authorName: string;
  /** Profile photo of the author when the review was written. */
  @Prop({ type: String, default: null }) authorAvatar: string | null;
  @Prop({ required: true, min: 1, max: 5 }) rating: number;
  @Prop({ default: '' }) title: string;
  @Prop({ required: true }) comment: string;
  @Prop({ default: true }) verified: boolean;
  @Prop({ type: [String], default: [] }) helpfulBy: string[];
  @Prop({ type: SellerReply, default: null }) reply: SellerReply | null;
  @Prop({ type: String, enum: ['published', 'hidden'], default: 'published' }) status:
    'published' | 'hidden';
  createdAt: Date;
}
export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index(
  { productId: 1, authorId: 1 },
  { unique: true, partialFilterExpression: { authorId: { $type: 'string' } } },
);

@Schema({ collection: 'stores' })
export class StoreOwner {
  @Prop({ type: String }) _id: string;
  @Prop({ required: true, index: true }) ownerId: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) slug: string;
}
export const StoreOwnerSchema = SchemaFactory.createForClass(StoreOwner);

@Schema({ collection: 'conversations', timestamps: true })
export class Conversation {
  @Prop(id) _id: string;
  @Prop({ required: true, index: true }) buyerId: string;
  @Prop({ required: true }) buyerName: string;
  @Prop({ required: true, index: true }) storeId: string;
  @Prop({ required: true }) storeName: string;
  @Prop({ type: String, default: null }) productId: string | null;
  @Prop({ type: String, default: null }) productTitle: string | null;
  @Prop({ type: String, default: null }) productImage: string | null;
  @Prop({ default: '' }) lastMessage: string;
  @Prop({ default: () => new Date() }) lastAt: Date;
  @Prop({ default: 0 }) unreadBuyer: number;
  @Prop({ default: 0 }) unreadSeller: number;
}
export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ buyerId: 1, storeId: 1, productId: 1 }, { unique: true });

@Schema({ collection: 'messages', timestamps: true })
export class Message {
  @Prop(id) _id: string;
  @Prop({ required: true, index: true }) conversationId: string;
  @Prop({ required: true }) senderId: string;
  @Prop({ type: String, enum: ['buyer', 'seller'], required: true }) senderRole: 'buyer' | 'seller';
  @Prop({ required: true, maxlength: 2000 }) text: string;
  createdAt: Date;
}
export const MessageSchema = SchemaFactory.createForClass(Message);

/**
 * In-app notification. Text is not stored: `type` + `params` are rendered by the web app in the
 * reader's language.
 */
@Schema({ collection: 'notifications', timestamps: true })
export class Notification {
  @Prop(id) _id: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true }) type: string;
  @Prop({ type: Object, default: {} }) params: Record<string, string | number>;
  @Prop({ default: '' }) link: string;
  @Prop({ default: false, index: true }) read: boolean;
  createdAt: Date;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);

@Schema({ collection: 'wishlist', timestamps: true })
export class WishlistItem {
  @Prop(id) _id: string;
  @Prop({ required: true, index: true }) userId: string;
  @Prop({ required: true, index: true }) productId: string;
  /** Price when saved, to show how much it dropped. */
  @Prop({ required: true }) priceUsdAtAdd: number;
  createdAt: Date;
}
export const WishlistItemSchema = SchemaFactory.createForClass(WishlistItem);
WishlistItemSchema.index({ userId: 1, productId: 1 }, { unique: true });
