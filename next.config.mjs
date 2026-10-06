/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Projektit siirtyivät Asiakkuuksien hallinnan alta omaksi pääosiokseen.
  // Vanhat linkit (kirjanmerkit, tiedostot) ohjataan uusiin osoitteisiin.
  async redirects() {
    return [
      { source: "/asiakkuuksien-hallinta/projektit", destination: "/projektit", permanent: true },
      { source: "/asiakkuuksien-hallinta/projektit/:polku*", destination: "/projektit/:polku*", permanent: true },
      // Rakennetyypit nimettiin Rakenneosiksi (kirjastoon voi lisätä myös ostonimikkeitä).
      { source: "/tuotehallinta/rakennetyypit", destination: "/tuotehallinta/rakenneosat", permanent: true },
      { source: "/tuotehallinta/rakennetyypit/:polku*", destination: "/tuotehallinta/rakenneosat/:polku*", permanent: true },
    ];
  },
};

export default nextConfig;
