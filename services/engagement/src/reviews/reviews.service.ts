import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, PipelineStage } from 'mongoose';
import { EventBus, type AuthUser } from '@mercadia/service-kit';
import { ServiceClients } from '../clients/clients.js';
import { Review } from '../schemas.js';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
    private readonly clients: ServiceClients,
    private readonly bus: EventBus,
  ) {}

  private summaryPipeline(match: Record<string, unknown>): PipelineStage[] {
    return [
      { $match: { ...match, status: 'published' } },
      {
        $group: {
          _id: null,
          avg: { $avg: '$rating' },
          count: { $sum: 1 },
          r1: { $sum: { $cond: [{ $lt: ['$rating', 1.5] }, 1, 0] } },
          r2: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$rating', 1.5] }, { $lt: ['$rating', 2.5] }] }, 1, 0],
            },
          },
          r3: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$rating', 2.5] }, { $lt: ['$rating', 3.5] }] }, 1, 0],
            },
          },
          r4: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$rating', 3.5] }, { $lt: ['$rating', 4.5] }] }, 1, 0],
            },
          },
          r5: { $sum: { $cond: [{ $gte: ['$rating', 4.5] }, 1, 0] } },
          replied: { $sum: { $cond: [{ $ne: ['$reply', null] }, 1, 0] } },
        },
      },
    ];
  }

  private shape(row?: {
    avg: number;
    count: number;
    r1: number;
    r2: number;
    r3: number;
    r4: number;
    r5: number;
    replied: number;
  }) {
    if (!row) return { avg: 0, count: 0, distribution: [0, 0, 0, 0, 0], replyRate: 0 };
    return {
      avg: Math.round(row.avg * 100) / 100,
      count: row.count,
      distribution: [row.r1, row.r2, row.r3, row.r4, row.r5],
      replyRate: row.count ? Math.round((row.replied / row.count) * 100) / 100 : 0,
    };
  }

  async forProduct(productId: string, sort: 'recent' | 'helpful' | 'rating' = 'recent', page = 1) {
    const order = {
      recent: { createdAt: -1 },
      helpful: { helpfulCount: -1, createdAt: -1 },
      rating: { rating: -1, createdAt: -1 },
    }[sort] as Record<string, 1 | -1>;
    const [items, [summary]] = await Promise.all([
      this.reviews.aggregate([
        { $match: { productId, status: 'published' } },
        { $addFields: { helpfulCount: { $size: '$helpfulBy' } } },
        { $sort: order },
        { $skip: (page - 1) * 10 },
        { $limit: 10 },
        { $project: { helpfulBy: 0 } },
      ]),
      this.reviews.aggregate(this.summaryPipeline({ productId })),
    ]);
    return { summary: this.shape(summary), items, page };
  }

  async storeReputation(storeId: string) {
    const [row] = await this.reviews.aggregate(this.summaryPipeline({ storeId }));
    return { storeId, ...this.shape(row) };
  }

  /** Only buyers who received the product (shipped or delivered) can review it, once. */
  async create(
    user: AuthUser,
    input: { productId: string; rating: number; title?: string; comment: string },
  ) {
    const [product] = await this.clients.products([input.productId]);
    if (!product) throw new NotFoundException('Product not found');
    if (!(await this.clients.hasPurchased(user.sub, input.productId))) {
      throw new ForbiddenException('Only buyers who received this product can review it');
    }
    try {
      const review = await this.reviews.create({
        productId: input.productId,
        storeId: product.store.id,
        authorId: user.sub,
        authorName:
          user.name.split(' ')[0] +
          (user.name.includes(' ') ? ` ${user.name.split(' ').at(-1)![0]}.` : ''),
        authorAvatar: user.picture ?? null,
        rating: input.rating,
        title: input.title ?? '',
        comment: input.comment,
        verified: true,
      });
      await this.bus.publish('review.created', {
        reviewId: review._id,
        productId: review.productId,
        storeId: review.storeId,
        rating: review.rating,
      });
      return review.toObject();
    } catch (error) {
      if (String(error).includes('E11000'))
        throw new ConflictException('You already reviewed this product');
      throw error;
    }
  }

  async helpful(id: string, user: AuthUser) {
    const review = await this.reviews.findByIdAndUpdate(
      id,
      { $addToSet: { helpfulBy: user.sub } },
      { new: true },
    );
    if (!review) throw new NotFoundException();
    return { helpful: review.helpfulBy.length };
  }

  async reply(id: string, user: AuthUser, text: string) {
    const review = await this.reviews.findById(id);
    if (!review) throw new NotFoundException();
    if (review.storeId !== user.storeId) throw new ForbiddenException();
    if (review.reply) throw new BadRequestException('Already replied');
    review.reply = { text, at: new Date() };
    await review.save();
    return review.toObject();
  }

  forStore(storeId: string) {
    return this.reviews
      .find({ storeId, status: 'published' })
      .sort({ createdAt: -1 })
      .limit(100)
      .select({ helpfulBy: 0 })
      .lean();
  }
}
