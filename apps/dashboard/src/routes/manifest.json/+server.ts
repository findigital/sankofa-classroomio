import { json } from '@sveltejs/kit';
import { appBrandName } from '$lib/utils/functions/brand';

export function GET() {
  const name = appBrandName();

  return json({
    background_color: '#ffffff',
    theme_color: '#333333',
    name,
    short_name: name,
    display: 'minimal-ui',
    start_url: '/',
    icons: [
      {
        src: 'logo-32.png',
        sizes: '32x32',
        type: 'image/png'
      },
      {
        src: 'logo-192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: 'logo-512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ]
  });
}
