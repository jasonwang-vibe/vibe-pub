import type { RequestHandler } from './$types';

// /robots.txt — explicit allow for known AI crawlers + sitemap pointer.
//
// Note: robots.txt only governs polite crawlers. Cloudflare Bot Fight Mode
// (or Super Bot Fight Mode) blocks AI bots at the network layer regardless of
// robots.txt. To unblock those, allowlist the same UAs in the Cloudflare
// dashboard — see docs/cloudflare-bot-allowlist.md.
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Googlebot',
  'Applebot',
  'Applebot-Extended',
  'Bingbot',
  'DuckDuckBot',
  'CCBot',
  'cohere-ai',
  'FacebookBot',
  'Meta-ExternalAgent',
  'Bytespider',
  'YouBot',
];

export const GET: RequestHandler = () => {
  return new Response('User-agent: *\nDisallow: /\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600, s-maxage=3600',
    },
  });
};
