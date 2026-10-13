/**
 * Tarjouksen PDF (asiakkaalle lähetettävä). Muodostetaan palvelimella
 * @react-pdf/rendererilla reitissä /api/tarjoukset/[tarjousId]/pdf.
 *
 * PDF ei sisällä sisäisiä tietoja (omakustannus, kate, rivien hinnat,
 * kustannuslajit), vaan tarjoushinnan ja rakennusten sisällön litteroittain
 * määrineen. Sisällöstä jätetään pois tehdastyörivit (tehtaan oma työ on
 * kustannusrakennetta, ei asiakkaalle näkyvää sisältöä), ja rivit, joiden
 * yksikkö on euro (esim. laskurin "Ikkunat"), näytetään ilman määrää, jotta
 * hinta ei paljastu. Sisältöerittelyn voi jättää kokonaan pois.
 *
 * Tarjoajan tiedot tulevat ympäristömuuttujista TARJOAJA_NIMI ja
 * TARJOAJA_YHTEYSTIEDOT (rivit erotettu merkillä |), ks. .env.example.
 */
import { Document, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/prisma";
import { litterajarjestys, litteranNimi, rakennuksenNimi, RAKENNUS_INCLUDE } from "@/lib/rakennukset";
import { rivinLaji, rivinLittera, rivinNimi, rivinYksikko } from "@/lib/rakenteet";
import { ALV } from "@/lib/tarjouslaskenta";

const VARIT = { tumma: "#0e4126", oranssi: "#ef7a2f", teksti: "#22231f", harmaa: "#5b5a52", viiva: "#d8ceb8", tausta: "#f6f2ea" };

// Helvetica (PDF:n vakiofontti) ei sisällä kapeaa sitovaa välilyöntiä, jota
// fi-FI-muotoilu käyttää tuhaterottimena, joten se korvataan välilyönnillä.
const tavallinen = (s: string) => s.replace(/[  ]/g, " ");
const euro = (sentit: number) =>
  tavallinen((sentit / 100).toLocaleString("fi-FI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + " €";
const luku = (n: number) => tavallinen(n.toLocaleString("fi-FI", { maximumFractionDigits: 2 }));
const pvm = (d: Date) => d.toLocaleDateString("fi-FI");

const tyyli = StyleSheet.create({
  sivu: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 44, fontFamily: "Helvetica", fontSize: 9.5, color: VARIT.teksti, lineHeight: 1.35 },
  ylaosa: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  otsikkoTeksti: { fontFamily: "Helvetica-Bold", fontSize: 20, color: VARIT.tumma, letterSpacing: 2, textAlign: "right", lineHeight: 1, marginBottom: 6 },
  tunniste: { fontSize: 9, color: VARIT.harmaa, textAlign: "right", marginTop: 2 },
  palkki: { height: 3, backgroundColor: VARIT.oranssi, marginTop: 14, marginBottom: 16, width: 60 },
  osapuolet: { flexDirection: "row", gap: 16, marginBottom: 18 },
  laatikko: { flex: 1, borderWidth: 1, borderColor: VARIT.viiva, padding: 10 },
  laatikonOtsikko: { fontFamily: "Helvetica-Bold", fontSize: 7.5, color: VARIT.harmaa, letterSpacing: 1, marginBottom: 4 },
  vahva: { fontFamily: "Helvetica-Bold" },
  tarjouksenNimi: { fontFamily: "Helvetica-Bold", fontSize: 14, color: VARIT.tumma, marginBottom: 10 },
  hinta: { backgroundColor: VARIT.tausta, padding: 12, marginBottom: 18 },
  hintarivi: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  hintaYhteensa: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: VARIT.tumma, marginTop: 4, paddingTop: 5 },
  osioOtsikko: { fontFamily: "Helvetica-Bold", fontSize: 11, color: VARIT.tumma, marginBottom: 6, marginTop: 4 },
  taulukonOtsikko: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: VARIT.tumma, paddingBottom: 3, marginBottom: 2 },
  rivi: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: VARIT.viiva, paddingVertical: 2.5 },
  litteraRivi: { flexDirection: "row", backgroundColor: VARIT.tausta, paddingVertical: 2.5, paddingHorizontal: 3, marginTop: 4 },
  pieni: { fontSize: 7.5, color: VARIT.harmaa },
  alaVasen: { position: "absolute", bottom: 24, left: 44, fontSize: 7.5, color: VARIT.harmaa },
  // render-View asettuu ~5 pt ylemmäs kuin vasen Text, joten bottom on pienempi.
  alaOikea: { position: "absolute", bottom: 19, right: 44, width: 120, fontSize: 7.5, color: VARIT.harmaa, textAlign: "right" },
  alaViiva: { position: "absolute", bottom: 38, left: 44, right: 44, borderTopWidth: 0.5, borderTopColor: VARIT.viiva },
});

function Logo() {
  return (
    <Svg viewBox="0 0 212 28" width={130} height={17}>
      <Path
        fill={VARIT.tumma}
        d="M30.1602 27.9912L34.9851 22.8064V0.00875841L30.1602 5.19362V22.7976H19.9051V3.5208L15.0801 8.70566V22.7889H4.82496V5.18486L0 0V22.7976L4.82496 27.9825H15.0801L19.9051 22.7976V27.9825H30.1602V27.9912ZM68.793 22.8064H43.4496V5.20238H68.793V22.8064ZM68.793 27.9912L73.618 22.7976V5.19362L68.793 0H43.4496L38.6246 5.19362V22.7976L43.4496 27.9912H68.793ZM107.426 22.8064H82.0824V5.20238H107.426V22.8064ZM107.426 27.9912L112.251 22.8064V5.20238L107.426 0.0175152H77.2575V28H82.0824H83.84H107.426V27.9912ZM146.067 27.9912L150.892 22.7976V5.19362L146.067 0V22.7976H120.724V0L115.899 5.19362V22.7976L120.724 27.9912H146.067ZM181.152 27.9912L176.31 22.7976H159.356V0H154.532V22.7976L159.356 27.9912H181.152ZM207.341 5.01845L212 0.00875841H185.247L180.588 5.01845V11.4995H185.247L180.588 16.5092V22.9903L185.247 28H212L207.341 22.9903H185.247V16.5092H204.182L208.841 11.4995H185.247V5.01845H207.341Z"
      />
    </Svg>
  );
}

/** Tarjousnumero tunnisteesta (järjestelmässä ei ole erillistä numerokenttää). */
export function tarjousnumero(offer: { id: string; createdAt: Date }): string {
  return `${offer.createdAt.getFullYear()}-${offer.id.slice(-6).toUpperCase()}`;
}

async function haeTarjous(id: string) {
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: { customer: true, buildings: { include: RAKENNUS_INCLUDE, orderBy: [{ seq: "asc" }, { code: "asc" }] } },
  });
  return offer;
}

type Tarjous = NonNullable<Awaited<ReturnType<typeof haeTarjous>>>;

function TarjousDokumentti({
  offer,
  paiva,
  tarjoaja,
  sisalto,
  sivuja,
}: {
  offer: Tarjous;
  paiva: Date;
  tarjoaja: { nimi: string; rivit: string[] };
  sisalto: boolean;
  sivuja?: number;
}) {
  const numero = tarjousnumero(offer);
  const c = offer.customer;
  return (
    <Document title={`Tarjous ${numero}: ${offer.title}`} author={tarjoaja.nimi} subject={offer.title} language="fi">
      <Page size="A4" style={tyyli.sivu}>
        {/* Kiinteä alatunniste ennen sisältöä, jotta se toistuu kaikilla sivuilla. */}
        <View style={tyyli.alaViiva} fixed />
        <Text style={tyyli.alaVasen} fixed>
          {`${tarjoaja.nimi} · Tarjous ${numero}${offer.validUntil ? ` · voimassa ${pvm(offer.validUntil)} asti` : ""}`}
        </Text>
        {/* render toimii kiinteässä View-elementissä (kiinteässä Text-elementissä se jää tyhjäksi,
            react-pdf 4.9), mutta View saa vain sivunumeron: kokonaismäärä tulee ensimmäiseltä
            renderöintikierrokselta (sivuja). Sisempi Text tarvitsee oman lineHeightin: sivulta
            peritty lineHeight 1.35 jättää render-tekstin piirtämättä. */}
        <View
          style={tyyli.alaOikea}
          fixed
          render={({ pageNumber }) => (
            <Text style={{ lineHeight: 1 }}>{sivuja ? `Sivu ${pageNumber} / ${sivuja}` : `Sivu ${pageNumber}`}</Text>
          )}
        />
        <View style={tyyli.ylaosa}>
          <Logo />
          <View>
            <Text style={tyyli.otsikkoTeksti}>TARJOUS</Text>
            <Text style={tyyli.tunniste}>Tarjousnumero {numero}</Text>
            <Text style={tyyli.tunniste}>Päiväys {pvm(paiva)}</Text>
            {offer.validUntil && <Text style={tyyli.tunniste}>Voimassa {pvm(offer.validUntil)} asti</Text>}
          </View>
        </View>
        <View style={tyyli.palkki} />

        <View style={tyyli.osapuolet}>
          <View style={tyyli.laatikko}>
            <Text style={tyyli.laatikonOtsikko}>TILAAJA</Text>
            <Text style={tyyli.vahva}>{c.name}</Text>
            {c.businessId && <Text>Y-tunnus {c.businessId}</Text>}
            {c.contactName && <Text>{c.contactName}</Text>}
            {c.contactEmail && <Text>{c.contactEmail}</Text>}
            {c.contactPhone && <Text>{c.contactPhone}</Text>}
          </View>
          <View style={tyyli.laatikko}>
            <Text style={tyyli.laatikonOtsikko}>TARJOAJA</Text>
            <Text style={tyyli.vahva}>{tarjoaja.nimi}</Text>
            {tarjoaja.rivit.map((r) => (
              <Text key={r}>{r}</Text>
            ))}
          </View>
        </View>

        <Text style={tyyli.tarjouksenNimi}>{offer.title}</Text>

        <View style={tyyli.hinta} wrap={false}>
          {offer.amountCents !== null ? (
            <>
              <View style={tyyli.hintarivi}>
                <Text>Tarjoushinta (alv 0 %)</Text>
                <Text style={tyyli.vahva}>{euro(offer.amountCents)}</Text>
              </View>
              <View style={tyyli.hintarivi}>
                <Text>Arvonlisävero {luku(ALV * 100)} %</Text>
                <Text>{euro(Math.round(offer.amountCents * ALV))}</Text>
              </View>
              <View style={tyyli.hintaYhteensa}>
                <Text style={tyyli.vahva}>Yhteensä (sis. alv)</Text>
                <Text style={tyyli.vahva}>{euro(offer.amountCents + Math.round(offer.amountCents * ALV))}</Text>
              </View>
            </>
          ) : (
            <Text>Tarjoushinta sovitaan erikseen.</Text>
          )}
        </View>

        {offer.buildings.length > 0 && (
          <View>
            <Text style={tyyli.osioOtsikko}>Rakennukset</Text>
            <View style={tyyli.taulukonOtsikko}>
              <Text style={[tyyli.vahva, { width: "20%" }]}>Tunnus</Text>
              <Text style={[tyyli.vahva, { width: "40%" }]}>Nimi</Text>
              <Text style={[tyyli.vahva, { width: "25%" }]}>Talotyyppi</Text>
              <Text style={[tyyli.vahva, { width: "15%", textAlign: "right" }]}>Bruttoala</Text>
            </View>
            {offer.buildings.map((b) => (
              <View key={b.id} style={tyyli.rivi}>
                <Text style={{ width: "20%" }}>{b.code}</Text>
                <Text style={{ width: "40%" }}>{b.name ?? "–"}</Text>
                <Text style={{ width: "25%" }}>{b.buildingType ?? "–"}</Text>
                <Text style={{ width: "15%", textAlign: "right" }}>{b.grossAreaM2 ? `${luku(b.grossAreaM2)} m²` : "–"}</Text>
              </View>
            ))}
          </View>
        )}

        {sisalto && offer.buildings.map((b) => {
          // Asiakkaalle: ei tehdastyöriviä (kustannusrakennetta), ei nollarivejä.
          const rivit = b.parts.filter((o) => o.quantity !== 0 && rivinLaji(o) !== "TEHDASTYO");
          if (rivit.length === 0) return null;
          const ryhmat = new Map<string, { littera: ReturnType<typeof rivinLittera>; rivit: typeof rivit }>();
          for (const o of rivit) {
            const l = rivinLittera(o);
            const g = ryhmat.get(l?.code ?? "") ?? { littera: l, rivit: [] };
            g.rivit.push(o);
            ryhmat.set(l?.code ?? "", g);
          }
          const litteroittain = [...ryhmat.values()].sort((x, y) => litterajarjestys(x.littera, y.littera));
          return (
            <View key={b.id} break>
              <Text style={tyyli.osioOtsikko}>Sisältö: {rakennuksenNimi(b)}</Text>
              <View style={tyyli.taulukonOtsikko}>
                <Text style={[tyyli.vahva, { width: "75%" }]}>Sisältö</Text>
                <Text style={[tyyli.vahva, { width: "25%", textAlign: "right" }]}>Määrä</Text>
              </View>
              {litteroittain.map(({ littera, rivit: rr }) => (
                <View key={littera?.code ?? "-"}>
                  <View style={tyyli.litteraRivi} wrap={false}>
                    <Text style={[tyyli.vahva, { fontSize: 8.5 }]}>{litteranNimi(littera)}</Text>
                  </View>
                  {rr.map((o) => (
                    <View key={o.id} style={tyyli.rivi} wrap={false}>
                      <Text style={{ width: "75%" }}>
                        {rivinNimi(o)}
                        {(o.structureType || o.product) && o.description ? ` (${o.description})` : ""}
                        {o.location ? ` · ${o.location}` : ""}
                      </Text>
                      <Text style={{ width: "25%", textAlign: "right" }}>
                        {/* Euromääräinen "määrä" on hinta, joten sitä ei näytetä. */}
                        {rivinYksikko(o) === "€" ? "sisältyy" : `${luku(o.quantity)} ${rivinYksikko(o)}`}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          );
        })}

      </Page>
    </Document>
  );
}

export interface TarjousPdf {
  tiedosto: Buffer;
  tiedostonimi: string;
}

/** Muodostaa tarjouksen PDF:n. Palauttaa null, jos tarjousta ei ole. */
export async function muodostaTarjousPdf(id: string, { paiva = new Date(), sisalto = true } = {}): Promise<TarjousPdf | null> {
  const offer = await haeTarjous(id);
  if (!offer) return null;
  const tarjoaja = {
    nimi: process.env.TARJOAJA_NIMI?.trim() || "Wodule",
    rivit: (process.env.TARJOAJA_YHTEYSTIEDOT ?? "")
      .split("|")
      .map((r) => r.trim())
      .filter(Boolean),
  };
  const dokumentti = (sivuja?: number) => (
    <TarjousDokumentti offer={offer} paiva={paiva} tarjoaja={tarjoaja} sisalto={sisalto} sivuja={sivuja} />
  );
  // Kaksi kierrosta: ensimmäinen laskee sivut (sivuobjektit näkyvät pakkaamattomina), toinen kirjoittaa "Sivu x / y".
  const luonnos = await renderToBuffer(dokumentti());
  const sivuja = (luonnos.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const tiedosto = await renderToBuffer(dokumentti(sivuja || undefined));
  const turvallinen = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
  return { tiedosto, tiedostonimi: `Tarjous_${tarjousnumero(offer)}_${turvallinen(offer.customer.name)}.pdf` };
}
