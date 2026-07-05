/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // potrace (and its jimp dependency) and sharp are native/CJS modules that
    // must run on the server and should not be bundled by webpack.
    serverComponentsExternalPackages: ["potrace", "sharp"],
  },
};

export default nextConfig;
