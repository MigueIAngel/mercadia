import { getTranslations } from 'next-intl/server';
import { Messages } from '@/components/Messages';
import { requireUser } from '@/lib/guard';

export async function generateMetadata() {
  const t = await getTranslations('messages');
  return { title: t('title') };
}

export default async function ConversationPage({ params }: PageProps<'/[locale]/messages/[id]'>) {
  const { id } = await params;
  const user = await requireUser(`/messages/${id}`);
  return <Messages activeId={id} userId={user.sub} storeId={user.storeId} />;
}
