# Toiminnanohjaus

Sisäinen toiminnanohjausjärjestelmä (ERP), rakennettu suoraan liitteenä olleen
sivukartta-/rakennekaavion mukaan (ks. `docs/rakennekaavio.jpg` ja
`docs/ARKKITEHTUURI.md`). Viisi pääosiota: **Asiakkuuksien hallinta**,
**Tuotehallinta**, **Reklamaatiot**, **Laadunvarmistus** ja **Tuotannon ohjaus**.

Tämä on ensimmäinen, toimiva versio kaikista viidestä osiosta - tarkoitettu
jatkokehitettäväksi Claude Codella. Ks. lopussa oleva **Jatkokehitys**-osio
siitä, mikä on tarkoituksella jätetty auki.

## Pikakäynnistys

Vaatii Node.js 20+, PostgreSQL 16:n (Dockerilla tai paikallisena palveluna,
tunnukset erp/erp, tietokanta erp) ja npm.

```bash
npm install
npm run db:generate           # npm 11 ohittaa Prisman asennusskriptin
cp .env.example .env          # oletusarvot toimivat suoraan docker-composen kanssa
docker compose up -d          # nostaa Postgresin porttiin 5432
npm run db:migrate            # luo taulut (kysyy migraation nimen ensimmäisellä kerralla)
npm run db:seed               # täyttää esimerkkidatalla (mm. tuttu 11 rivin tuotantoaikataulu)
npm run dev                   # http://localhost:3000
```

`npm run db:studio` avaa Prisma Studion tietokannan selaamiseen ilman
käyttöliittymää.

## Rakenne

Ks. `docs/ARKKITEHTUURI.md` - siellä on täysi taulukko kaavion jokaisesta
solmusta ja sen vastaavasta reitistä/Prisma-mallista, sekä selitys
teknologiavalinnoille.

Lyhyesti:

- `src/app/**` - yksi kansio per kaavion solmu (Next.js App Router).
- `prisma/schema.prisma` - koko tietomalli, kommentoitu kaavion mukaan.
- `src/lib/production-schedule.ts` - Tuotantoaikataulun kesto/ennuste-kaavat,
  suoraan portattuna aiemmin rakennetusta Artifact-työkalusta.
- `src/lib/actions/*.ts` - Server Actions -pohjaiset CRUD-toiminnot per osio.
- `src/lib/tiedonsiirto/` - tietojen tuonti ja vienti (`/tiedonsiirto`).

## Tiedonsiirto

Sivulla `/tiedonsiirto` voi tuoda ja viedä kaikkien osioiden tietoja:

- **Vienti:** Excel, CSV tai JSON yksittäisestä kohteesta. Koko järjestelmän
  saa viedyksi Excel-työkirjana (välilehti per kohde + ohjeet) tai
  JSON-varmuuskopiona.
- **Tuonti:** Excel, CSV (; , tai sarkain, UTF-8 tai Windows-1252) tai JSON.
  Tuonti tehdään kahdessa vaiheessa. Esikatselu näyttää rivikohtaisesti,
  mitä luotaisiin, päivitettäisiin tai ohitettaisiin ja mitkä rivit ovat
  virheellisiä, eikä se muuta mitään. Tallennus käyttää samoja asetuksia.
  Olemassa olevat rivit tunnistetaan luonnollisella avaimella (esim.
  nimikekoodi, Y-tunnus tai asiakkaan nimi), joten viety tiedosto kelpaa
  sellaisenaan takaisin tuotavaksi.
- **Pohjat:** tyhjä tuontipohja kohteittain, esimerkkirivin kanssa.
- **Loki:** tallennetut tuonnit ja viennit kirjataan tauluun `DataTransferLog`.

Kohteet: asiakkaat, tarjoukset, projektit, tilausvahvistukset,
virstanpylväät, hankintasuunnitelmat, tuotantoaikataulu, nimikkeet,
hinnastot, hinnastorivit, reklamaatiot, tarkastuslistat, tarkastuskohdat,
dopit, tuotantokansiot, työmääräimet ja piirustukset.

## Jatkokehitys (Claude Code)

**Tilanne 30.9.2026.** Tehty ensimmäisen version jälkeen:

- Alkumigraatio ja ESLint-asetukset.
- Vitest ja testit tuotantoaikataulun laskennalle ja tiedonsiirrolle (50 testiä).
- Tiedonsiirto: kaikkien osioiden tuonti ja vienti (`/tiedonsiirto`).
- Ulkoasu Wodulen brändi-ilmeen mukaiseksi (wodule.fi).

**Tilanne 1.10.2026.** Projektinhallinta projektinhallinnan Excelin pohjalta:

- Projektiaikataulu tehtäväaikatauluksi (T1, T2, …, edeltäjä, siirto, kesto, ennuste, Gantt).
- Hankintasuunnitelma kytketty aikatauluun: toimituspäivä aikataulusta, vaiheiden takarajat taaksepäin, vaiheet ja vastuuhenkilöt.
- Tehtäväluettelo henkilöittäin, henkilörekisteri (`/henkilot`) ja projektiorganisaatio.
- Projektin Excelin voi tuoda suoraan projektin sivulta.

Seuraavaksi: kokeile uusia projektisivuja selaimessa oikealla projektilla
(tehtävien jako henkilöille, vaiheiden siirto, Excel-tuonti) ja korjaa
havainnot ennen uusia ominaisuuksia.

Kaikki viisi osiota ovat käytettävissä (lisäys ja listaus tietokannasta), mutta
moni yksityiskohta on vielä auki. Ehdotettu järjestys:

1. **Kirjautuminen ja käyttöoikeudet.** `User`-malli ja `UserRole`-enum ovat
   skeemassa valmiina, mutta eivät kytkettynä mihinkään. Lisää esim.
   NextAuth/Auth.js, ja rajaa esim. `Laadunvarmistus`/`Tuotannon ohjaus`
   -kirjoitukset roolin mukaan.
2. **Tiedostojen tallennus.** `Dopit`, `Piirustukset` ja tarjousten liitteet
   käyttävät tällä hetkellä pelkkää `fileUrl`-tekstikenttää. Korvaa oikealla
   tiedostotallennuksella (S3-yhteensopiva, esim. Cloudflare R2 tai
   Supabase Storage).
3. **Sharepoint-integraatio.** `ProductionFolder.sharepointUrl` on tällä
   hetkellä pelkkä linkki. Oikea toteutus vaatisi Microsoft Graph -integraation
   kansion sisällön (tiedostolistan) hakemiseksi suoraan tähän näkymään.
4. **Tuotantoaikataulun Gantt-visualisointi.** Nykyinen Gantt
   (`TuotantoaikatauluClient.tsx`) on tarkoituksella yksinkertaistettu versio
   alkuperäisestä Artifact-työkalusta (ei kuukausi/viikko-otsikoita, ei
   mukautettua hover-tooltipiä - pelkkä `title`-attribuutti). Jos rikkaampi
   aikajana halutaan takaisin, se voi ottaa suoraan mallia alkuperäisestä
   Artifact-sivusta.
5. **Testit.** Vitest on käytössä (`npm test`). Testattuja ovat
   `src/lib/production-schedule.ts` ja tiedonsiirron puhdas logiikka.
   Seuraavaksi kannattaa testata Server Actionsien ja rajapintareittien
   validointi sekä tiedonsiirron tuonti tietokantaa vasten.
6. **Muokkaus ja poisto.** Projektiaikataulussa, hankintasuunnitelmassa,
   tehtäväluettelossa ja henkilöissä voi muokata ja poistaa. Muilla sivuilla
   voi vielä vain lisätä ja listata. Niillä muokkaus onnistuu tiedonsiirron
   kautta (vie, muokkaa, tuo).
7. **Validointi API-rajapinnoissa.** `src/lib/validation.ts` kattaa
   Tuotantoaikataulu-rajapinnan; muut Server Actions käyttävät kevyempää
   inline-zod-validointia - yhtenäistä tyyliä jos halutaan.

## Tekninen tausta: kaksi eri "aikataulua"

Kaaviossa esiintyy kaksi eri aikataulukäsitettä - älä sekoita niitä
jatkokehityksessä:

- **Tuotantoaikataulu projektit** (`ProductionScheduleItem`) - tarkka
  tuotannon Gantt, ketjutettu `seq`-järjestyksessä, jossa jokaisen rivin
  aloitus lasketaan edellisen rivin ennusteesta + `siirto`. **"Kesto" on ainoa
  aikataulua ohjaava kenttä** - "Laskennallinen kesto" on pelkkä vertailuluku
  eikä saa koskaan syöttää arvoa "Kesto"-kenttään.
- **Projektiaikataulu** (`ScheduleTask` + virstanpylväät `ProjectMilestone`) -
  yksittäisen projektin tehtäväaikataulu, jossa tehtävät viittaavat
  edeltäjiinsä tunnuksella. Ei kytköksissä yllä olevaan. Hankintasuunnitelman
  takarajat lasketaan tästä aikataulusta.
