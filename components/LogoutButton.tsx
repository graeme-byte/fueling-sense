'use client';

import { signOut } from '@/app/actions/auth';

export default function LogoutButton({ className }: { className?: string }) {
  return (
    <button onClick={() => signOut()} className={className}>
      Change account
    </button>
  );
}
