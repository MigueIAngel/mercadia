import { Suspense } from 'react';
import { AuthForm } from '@/components/AuthForm';

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="card p-8">
        <Suspense>
          <AuthForm mode="register" />
        </Suspense>
      </div>
    </div>
  );
}
