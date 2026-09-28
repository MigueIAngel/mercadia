import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { EventBus } from '@mercadia/service-kit';
import { ServiceClients } from '../clients/clients.js';
import { StoreOwner, WishlistItem } from '../schemas.js';
import { NotificationsService } from './notifications.service.js';

/** Turns platform events into notifications for buyers and sellers. */
@Injectable()
export class EventNotifications implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly notifications: NotificationsService,
    private readonly clients: ServiceClients,
    @InjectModel(StoreOwner.name) private readonly stores: Model<StoreOwner>,
    @InjectModel(WishlistItem.name) private readonly wishlist: Model<WishlistItem>,
  ) {}

  private async ownerOf(storeId: string) {
    return (await this.stores.findById(storeId).lean())?.ownerId;
  }

  onModuleInit() {
    const orderLink = (id: string) => `/account/orders/${id}`;

    this.bus.on('user.registered', ({ data }) =>
      this.notifications.notify(data.userId, 'welcome', { name: data.name }, '/', true),
    );

    this.bus.on('store.opened', async ({ data }) => {
      await this.stores.updateOne(
        { _id: data.storeId },
        { ownerId: data.ownerId, name: data.name, slug: data.slug },
        { upsert: true },
      );
    });
    this.bus.on('store.updated', async ({ data }) => {
      await this.stores.updateOne({ _id: data.storeId }, { name: data.name, slug: data.slug });
    });

    this.bus.on('order.paid', async ({ data }) => {
      const order = await this.clients.order(data.orderId);
      await this.notifications.notify(
        data.buyerId,
        'order_paid',
        { number: order?.number ?? '' },
        orderLink(data.orderId),
        true,
      );
    });

    this.bus.on('seller_order.status_changed', async ({ data }) => {
      if (data.status !== 'paid') return;
      const owner = await this.ownerOf(data.storeId);
      const order = await this.clients.order(data.orderId);
      if (owner)
        await this.notifications.notify(
          owner,
          'new_sale',
          { number: order?.number ?? '' },
          '/seller/orders',
        );
    });

    this.bus.on('shipment.status_changed', async ({ data }) => {
      if (!['in_transit', 'out_for_delivery', 'delivered'].includes(data.status)) return;
      const order = await this.clients.order(data.orderId);
      const store =
        order?.sellers.find((s) => s.sellerOrderId === data.sellerOrderId)?.storeName ?? '';
      const type =
        data.status === 'delivered'
          ? 'order_delivered'
          : data.status === 'in_transit'
            ? 'order_shipped'
            : 'out_for_delivery';
      await this.notifications.notify(
        data.buyerId,
        type,
        { number: order?.number ?? '', store, tracking: data.trackingNumber },
        orderLink(data.orderId),
        type !== 'out_for_delivery',
      );
    });

    this.bus.on('order.cancelled', async ({ data }) => {
      const order = await this.clients.order(data.orderId);
      await this.notifications.notify(
        data.buyerId,
        'order_cancelled',
        { number: order?.number ?? '', reason: data.reason },
        orderLink(data.orderId),
        true,
      );
    });

    this.bus.on('refund.succeeded', async ({ data }) => {
      const order = await this.clients.order(data.orderId);
      if (order)
        await this.notifications.notify(
          order.buyerId,
          'refund',
          { number: order.number },
          orderLink(data.orderId),
          true,
        );
    });

    this.bus.on('dispute.opened', async ({ data }) => {
      const owner = await this.ownerOf(data.storeId);
      if (owner)
        await this.notifications.notify(
          owner,
          'dispute_opened',
          {},
          `/account/disputes/${data.disputeId}`,
        );
    });

    this.bus.on('dispute.resolved', async ({ data }) => {
      const order = await this.clients.order(data.orderId);
      if (order)
        await this.notifications.notify(
          order.buyerId,
          'dispute_resolved',
          { resolution: data.resolution },
          `/account/disputes/${data.disputeId}`,
        );
    });

    // Price alerts: everyone who saved the product at a higher price hears about the drop.
    this.bus.on('product.price_changed', async ({ data }) => {
      if (data.newPriceUsd >= data.oldPriceUsd) return;
      const watchers = await this.wishlist
        .find({ productId: data.productId, priceUsdAtAdd: { $gt: data.newPriceUsd } })
        .lean();
      for (const w of watchers) {
        await this.notifications.notify(
          w.userId,
          'price_drop',
          { title: data.title, productId: data.productId },
          '/wishlist',
          true,
        );
      }
    });
  }
}
