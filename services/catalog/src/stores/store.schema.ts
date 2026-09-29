import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

/** Local read model of the stores owned by identity, kept up to date by events. */
@Schema({ collection: 'stores', timestamps: true })
export class StoreView {
  @Prop({ type: String })
  _id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  slug: string;

  @Prop({ type: String, default: null })
  logoUrl: string | null;

  @Prop({ default: '#6366f1' })
  accentColor: string;

  @Prop({ default: '' })
  city: string;
}

export const StoreViewSchema = SchemaFactory.createForClass(StoreView);
