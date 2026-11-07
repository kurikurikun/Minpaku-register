'use client';

import { useFormState } from 'react-dom';
import { login } from '../actions';

export default function LoginPage() {
  const [error, action] = useFormState(login, null);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm items-center p-6">
      <form action={action} className="card w-full space-y-4">
        <h1 className="text-xl font-semibold">Admin login</h1>
        <input name="user" className="input" placeholder="Name" autoCapitalize="none" autoComplete="username" autoFocus required />
        <input name="password" type="password" className="input" placeholder="Password" autoComplete="current-password" required />
        {error && <p className="text-sm font-medium text-neutral-900">{error}</p>}
        <button className="btn w-full">Log in</button>
      </form>
    </main>
  );
}
