import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class ReservedLine {
  @Prop({ required: true })
  productId: string;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  quantity: number;
}

/** Stock held for an order until it is paid (committed) or cancelled/expired (released). */
@Schema({ collection: 'reservations', timestamps: true })
export class Reservation {
  /** The order id. */
  @Prop({ type: String })
  _id: string;

  @Prop({ type: [ReservedLine], default: [] })
  lines: ReservedLine[];

  @Prop({
    type: String,
    enum: ['reserved', 'committed', 'released'],
    default: 'reserved',
    index: true,
  })
  status: 'reserved' | 'committed' | 'released';

  @Prop({ required: true, index: true })
  expiresAt: Date;
}

export const ReservationSchema = SchemaFactory.createForClass(Reservation);
