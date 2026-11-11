import { redirect } from '@sveltejs/kit';

export function redirectToSignIn(returnPath: string): never {
  redirect(303, `/login?redirect=${encodeURIComponent(returnPath)}`);
}
