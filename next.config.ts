import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The embedded dev database is only ever loaded locally; keep it out of the server bundle.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],
  // migrations are read from disk at startup (Supabase), so they must ship with the server bundle
  outputFileTracingIncludes: { '/**': ['./supabase/migrations/**/*', './src/lib/db/local-stubs.sql'] },
  async redirects() {
    return [
      { source: '/settings', destination: '/setup', permanent: false },
      ...[
        'today',
        'today-brief',
        'calls',
        'agent',
        'desk',
        'pipeline',
        'feeds',
        'qc',
        'deliveries',
        'compliance',
        'demo-control',
      ].map((p) => ({ source: '/' + p + '/:path*', destination: '/brief', permanent: false })),
    ];
  },
  poweredByHeader: false,
  devIndicators: false,
  experimental: { serverActions: { bodySizeLimit: '1mb' } },
};

export default nextConfig;
