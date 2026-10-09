// Rakennekaavion generaattori: `node docs/rakennekaavio.mjs`
//
// Tuottaa tiedoston docs/rakennekaavio.svg. Rakenne kuvataan alla puuna, ja
// asettelu lasketaan automaattisesti samalla tyylillä kuin alkuperäisessä
// kaaviossa (docs/rakennekaavio-alkuperainen.jpg): ylimmät tasot vierekkäin,
// syvemmät tasot sisennettyinä allekkain.
//
// Kun osio tai alasivu muuttuu, päivitä puu tähän, aja skripti ja päivitä
// samalla docs/ARKKITEHTUURI.md:n taulukko ja src/components/SectionNav.tsx.
// PNG-kuvan saa Edgellä (ks. CLAUDE.md).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------
// Rakenne
//   n(nimi, { uusi, suunta }, ...lapset)
//   uusi:   lisätty tai muuttunut alkuperäiseen kaavioon nähden (oranssi)
//   suunta: "vaaka" = lapset rinnakkain alla, "pysty" (oletus) = allekkain sisennettyinä
//   "\n" nimessä = rivinvaihto
// ------------------------------------------------------------
const n = (nimi, asetukset = {}, ...lapset) => ({ nimi, ...asetukset, lapset });

const PUU = n(
  "Pääikkuna",
  { suunta: "vaaka" },
  n(
    "Asiakkuuksien\nhallinta",
    { suunta: "vaaka" },
    n("Tarjoukset", {}, n("Tarjous 1", { uusi: true }, n("Rakennukset ja\nmääräluettelo", { uusi: true }), n("Omakustannus\nja kate", { uusi: true }))),
    n("Tarjouslaskenta", { uusi: true }, n("Laskuri", { uusi: true }), n("Manuaalinen\nlaskenta", { uusi: true }), n("Laskentapohjat", { uusi: true }))
  ),
  n(
    "Projektit",
    { uusi: true, suunta: "vaaka" },
    n("Tuotantoaikataulu\nprojektit"),
    n(
      "Projekti 1",
      {},
      n("Yhteenvetosivu\n(tilausvahvistus)"),
      n(
        "Rakennukset",
        { uusi: true },
        n("Rakennus A", { uusi: true }, n("Määräluettelo", { uusi: true }), n("Elementit", { uusi: true }), n("Tarkastukset", { uusi: true }), n("Reklamaatiot", { uusi: true }))
      ),
      n("Projektiaikataulu"),
      n("Hankinta-\nsuunnitelma"),
      n("Materiaalitarve", { uusi: true }),
      n("Tehtäväluettelo", { uusi: true })
    ),
    n("Projekti 2")
  ),
  n(
    "Tuotehallinta",
    { suunta: "vaaka" },
    n("Nimikkeistö", {}, n("Tuote1"), n("Tuote2")),
    n("Rakenneosat", { uusi: true }, n("Litterat\n(Talo 80)", { uusi: true }), n("Rakenteet", { uusi: true }), n("Ostonimikkeet", { uusi: true })),
    n("Hinnastot")
  ),
  n("Reklamaatiot"),
  n("Laadunvarmistus", {}, n("Tarkastuslistat"), n("Dopit")),
  n("Tuotannon ohjaus", {}, n("Sharepoint\ntuotantokansio", {}, n("Projekti 1", {}, n("Työmääräin"), n("Piirustukset")))),
  n("Järjestelmä", { uusi: true }, n("Henkilöt", { uusi: true }), n("Tiedonsiirto", { uusi: true }))
);

// ------------------------------------------------------------
// Ulkoasu
// ------------------------------------------------------------
const W = 170; // laatikon leveys
const H = 72; // laatikon korkeus
const VAAKAVALI = 26; // rinnakkaisten alipuiden väli
const PYSTYVALI = 52; // tason väli (vaakasuuntaiset lapset)
const SISENNYS = 40; // allekkaisten lasten sisennys
const RIVIVALI = 18; // allekkaisten lasten väli
const REUNA = 60;
const OTSIKKO = 70; // tila otsikolle ja selitteelle

const VARIT = { perus: "#1a6085", uusi: "#ef7a2f", viiva: "#16506f", teksti: "#ffffff" };

// Alipuun koko: { w, h } laatikon vasemmasta yläkulmasta.
function koko(s) {
  if (s.koko) return s.koko;
  if (s.lapset.length === 0) return (s.koko = { w: W, h: H });
  const lapset = s.lapset.map(koko);
  if (s.suunta === "vaaka") {
    const w = lapset.reduce((a, l) => a + l.w, 0) + VAAKAVALI * (lapset.length - 1);
    const h = H + PYSTYVALI + Math.max(...lapset.map((l) => l.h));
    return (s.koko = { w: Math.max(W, w), h });
  }
  const w = SISENNYS + Math.max(...lapset.map((l) => l.w));
  const h = H + lapset.reduce((a, l) => a + RIVIVALI + l.h, 0);
  return (s.koko = { w: Math.max(W, w), h });
}

const laatikot = [];
const viivat = [];

// Sijoittaa alipuun niin, että sen vasen yläkulma on (x, y).
// Vaakasuuntaisen solmun laatikko keskitetään lastensa yläpuolelle.
function sijoita(s, x, y) {
  const { w } = koko(s);
  if (s.suunta === "vaaka" && s.lapset.length) {
    const lapsetW = s.lapset.reduce((a, l) => a + koko(l).w, 0) + VAAKAVALI * (s.lapset.length - 1);
    let lx = x + (w - lapsetW) / 2;
    const ly = y + H + PYSTYVALI;
    const ankkurit = [];
    for (const l of s.lapset) {
      const lb = sijoita(l, lx, ly);
      ankkurit.push(lb.x + W / 2);
      lx += koko(l).w + VAAKAVALI;
    }
    // Vanhemman laatikko keskelle ensimmäisen ja viimeisen lapsen laatikoiden väliin.
    const bx = (ankkurit[0] + ankkurit[ankkurit.length - 1]) / 2 - W / 2;
    laatikot.push({ s, x: bx, y });
    const vy = y + H + PYSTYVALI / 2;
    viivat.push(`M${bx + W / 2},${y + H}V${vy}`);
    viivat.push(`M${Math.min(...ankkurit)},${vy}H${Math.max(...ankkurit)}`);
    for (const ax of ankkurit) viivat.push(`M${ax},${vy}V${ly}`);
    return { x: bx };
  }
  laatikot.push({ s, x, y });
  if (s.lapset.length) {
    const runko = x + 16;
    let ly = y + H + RIVIVALI;
    let viimeinen = ly;
    for (const l of s.lapset) {
      sijoita(l, x + SISENNYS, ly);
      viimeinen = ly + H / 2;
      viivat.push(`M${runko},${viimeinen}H${x + SISENNYS}`);
      ly += koko(l).h + RIVIVALI;
    }
    viivat.push(`M${runko},${y + H}V${viimeinen}`);
  }
  return { x };
}

const puu = koko(PUU);
sijoita(PUU, REUNA, REUNA + OTSIKKO);
const leveys = puu.w + REUNA * 2;
const korkeus = puu.h + REUNA * 2 + OTSIKKO;

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function laatikko({ s, x, y }) {
  const rivit = s.nimi.split("\n");
  const ensimmainen = y + H / 2 - ((rivit.length - 1) * 19) / 2;
  const teksti = rivit
    .map((r, i) => `<tspan x="${x + W / 2}" y="${ensimmainen + i * 19}">${esc(r)}</tspan>`)
    .join("");
  return `<rect x="${x}" y="${y}" width="${W}" height="${H}" fill="${s.uusi ? VARIT.uusi : VARIT.perus}"/>
<text dominant-baseline="middle" text-anchor="middle">${teksti}</text>`;
}

const paiva = new Date().toLocaleDateString("fi-FI");
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generoitu: node docs/rakennekaavio.mjs. Älä muokkaa käsin. -->
<svg xmlns="http://www.w3.org/2000/svg" width="${leveys}" height="${korkeus}" viewBox="0 0 ${leveys} ${korkeus}" font-family="DejaVu Sans, Segoe UI, Arial, sans-serif" font-size="16">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="${REUNA}" y="${REUNA + 6}" font-size="26" font-weight="bold" fill="#0e4126">Wodule ERP – rakennekaavio</text>
<text x="${REUNA}" y="${REUNA + 36}" font-size="15" fill="#444">Päivitetty ${paiva}. Projekti on pääobjekti: projekti → rakennus → määräluettelo (rakenneosa × määrä) ja elementit.</text>
<g transform="translate(${leveys - REUNA - 380}, ${REUNA - 12})" font-size="15">
  <rect width="22" height="22" fill="${VARIT.perus}"/><text x="32" y="16" fill="#222">Alkuperäinen kaavio</text>
  <rect x="190" width="22" height="22" fill="${VARIT.uusi}"/><text x="222" y="16" fill="#222">Uusi tai muuttunut</text>
</g>
<path d="${viivat.join("")}" stroke="${VARIT.viiva}" stroke-width="3" fill="none"/>
<g fill="${VARIT.teksti}">
${laatikot.map(laatikko).join("\n")}
</g>
</svg>
`;

const kohde = fileURLToPath(new URL("./rakennekaavio.svg", import.meta.url));
writeFileSync(kohde, svg);
console.log(`Kirjoitettu ${kohde} (${leveys} × ${korkeus})`);
