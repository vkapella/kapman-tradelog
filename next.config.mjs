/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/accounts",
        destination: "/ledger-admin?tab=accounts",
        permanent: false,
      },
      {
        source: "/adjustments",
        destination: "/ledger-admin?tab=adjustments",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
