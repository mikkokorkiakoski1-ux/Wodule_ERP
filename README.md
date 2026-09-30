# Toiminnanohjaus

Sisäinen toiminnanohjausjärjestelmä (ERP), rakennettu suoraan liitteenä olleen
sivukartta-/rakennekaavion mukaan (ks. `docs/rakennekaavio.jpg` ja
`docs/ARKKITEHTUURI.md`). Viisi pääosiota: **Asiakkuuksien hallinta**,
**Tuotehallinta**, **Reklamaatiot**, **Laadunvarmistus** ja **Tuotannon ohjaus**.

Tämä on ensimmäinen, toimiva versio kaikista viidestä osiosta - tarkoitettu
jatkokehitettäväksi Claude Codella. Ks. lopussa oleva **Jatkokehitys**-osio
siitä, mikä on tarkoituksella jätetty auki.

## Pikakäynnistys

Vaatii Node.js 20+, Docker (paikalliseen Postgresiin) ja pnpm/npm.

```bash
npm install
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

## Jatkokehitys (Claude Code)

Tämä on tarkoituksella laaja mutta matala ensimmäinen versio: kaikki viisi
osiota ovat oikeasti käytettävissä (lisäys/listaus tietokannasta), mutta moni
yksityiskohta on jätetty seuraavaa kierrosta varten. Ehdotettu järjestys:

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
5. **Testit.** Vitest on käytössä (`npm test`), ja
   `src/lib/production-schedule.ts` on testattu. Seuraavaksi kannattaa testata
   Server Actionsien ja rajapintareittien validointi.
6. **Validointi API-rajapinnoissa.** `src/lib/validation.ts` kattaa
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
- **Projektiaikataulu** (`ProjectMilestone`) - yksittäisen projektin
  asiakkaalle näkyvät virstanpylväät, ei kytköksissä yllä olevaan.
