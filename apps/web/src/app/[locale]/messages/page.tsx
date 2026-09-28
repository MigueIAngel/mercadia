import { getTranslations } from 'next-intl/server';
import { Messages } from '@/components/Messages';
import { requireUser } from '@/lib/guard';

export async function generateMetadata() {
  const t = await getTranslations('messages');
  return { title: t('title') };
}

export default async function MessagesPage() {
  const user = await requireUser('/messages');
  return <Messages userId={user.sub} storeId={user.storeId} />;
}
