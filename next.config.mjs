/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // potrace (and its jimp dependency) and sharp are native/CJS modules that
    // must run on the server and should not be bundled by webpack.
    serverComponentsExternalPackages: ["potrace", "sharp"],
  },
  // Pre-release: the product tool at /app is kept in the repo but not exposed to
  // visitors yet — this is a gauge-interest / waitlist site. Anyone who reaches
  // /app is bounced to the landing (and its waitlist). Remove this redirect to
  // turn the tool back on at launch. Temporary (307) so it isn't cached forever.
  async redirects() {
    return [
      {
        source: "/app",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
