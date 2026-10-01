# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekti

Sisäinen toiminnanohjausjärjestelmä (ERP). Tekniikka: Next.js 14 (App Router) + TypeScript, PostgreSQL + Prisma, Tailwind. Käyttöliittymä, reittien nimet, mallien kommentit ja dokumentaatio ovat **suomeksi**. Kirjoita myös uudet käyttäjälle näkyvät tekstit, reittisegmentit, kommentit ja dokumentaatio suomeksi.

## Komennot

```bash
npm install                 # npm 11 ohittaa asennusskriptit: aja sen jälkeen npm run db:generate
cp .env.example .env        # DATABASE_URL vastaa docker-composen oletuksia
docker compose up -d        # Postgres 16, localhost:5432 (erp/erp/erp)
npm run db:migrate          # prisma migrate dev
npm run db:seed             # tsx prisma/seed.ts (mm. 11 rivin tuotantoaikataulu)
npm run dev                 # http://localhost:3000

npm run build
npm run lint                # next lint
npm run typecheck           # tsc --noEmit
npm run db:generate         # generoi Prisma-client skeemamuutosten jälkeen
npm run db:push             # synkronoi skeema ilman migraatiota
npm run db:studio

npm test                    # vitest run (kaikki testit)
npx vitest run src/lib/production-schedule.test.ts   # yksi tiedosto
```

- **Migraatiot ilman interaktiivista komentoa.** `prisma migrate dev` ei toimi ei-interaktiivisessa ympäristössä (esim. Claude Code). Kun tietokanta on ajan tasalla edellisestä migraatiosta, luo uusi näin:
  ```bash
  mkdir prisma/migrations/<AAAAKKPPTTMMSS>_<nimi>
  npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<...>/migration.sql
  npx prisma migrate deploy && npx prisma generate
  ```
- **Älä aja `npm run build`:ia kehityspalvelimen ollessa käynnissä.** Molemmat käyttävät `.next`-kansiota, ja kehityspalvelin alkaa palauttaa 500-virheitä. Pysäytä palvelin, aja build, poista `.next` ja käynnistä palvelin uudelleen.
- Tailwindin konfiguraatiomuutokset vaativat kehityspalvelimen uudelleenkäynnistyksen.

Testikehys on Vitest (`vitest.config.ts` määrittää `@/`-aliaksen). Testit ovat testattavan tiedoston vieressä (`*.test.ts`). Testattuja ovat `src/lib/production-schedule.ts`, projektiaikataulun ja hankintojen laskenta (`src/lib/projektiaikataulu.test.ts`) ja tiedonsiirron puhdas logiikka (`src/lib/tiedonsiirto/tiedonsiirto.test.ts`: CSV, arvojen tulkinta, otsikoiden tunnistus). Tietokantaa käyttävää tuontia ei ole yksikkötestattu. Tuotantoaikataulun testit lukitsevat alkuperäisen laskennan toiminnan, joten hajoava testi tarkoittaa yleensä kiellettyä laskennan muutosta.

## Arkkitehtuuri

**Rakennekaavio on totuuden lähde.** `docs/rakennekaavio.jpg` määrittää kaikki osiot ja alasivut. `docs/ARKKITEHTUURI.md` sisältää vastaavuustaulukon: kaavion solmu → reitti → Prisma-malli(t). Jos rakenne muuttuu, päivitä yhdessä kaavio, tämä taulukko ja `src/components/SectionNav.tsx`.

Viisi pääosiota ovat kukin oma kansionsa `src/app/`-hakemistossa: `asiakkuuksien-hallinta`, `tuotehallinta`, `reklamaatiot`, `laadunvarmistus`, `tuotannon-ohjaus`. `prisma/schema.prisma` on ryhmitelty samoihin viiteen osioon.

Tietoa käsitellään kolmella tavalla:
- **Server Actions (oletus).** Sivut ovat palvelinkomponentteja, jotka kyselevät `prisma`-singletonia (`src/lib/prisma.ts`) suoraan. Lomakkeet lähettävät tiedot `"use server"`-funktioille tiedostoissa `src/lib/actions/<osio>.ts`. Jokainen toiminto validoi `FormData`:n inline-zod-skeemalla, kirjoittaa Prisman kautta ja kutsuu lopuksi `revalidatePath`-funktiota muuttuneelle reitille.
- **REST + client-komponentti (poikkeus).** "Tuotantoaikataulu projektit" (`/asiakkuuksien-hallinta/projektit/tuotantoaikataulu`) renderöi komponentin `src/components/TuotantoaikatauluClient.tsx`. Se kutsuu reittejä `src/app/api/tuotantoaikataulu/**`:
  - kokoelma: `GET` ja `POST`
  - `[id]`: muokkaus ja poisto
  - `jarjestys`: järjestyksen vaihto, joka vaihtaa kahden rivin `seq`-arvot transaktiossa

  Näiden reittien pyyntöskeemat ovat tiedostossa `src/lib/validation.ts`.
- **Tiedonsiirto (REST, kaavion ulkopuolinen työkalu).** `/tiedonsiirto` tuo ja vie kaikkien osioiden tietoja CSV-, Excel- (`exceljs`) ja JSON-muodossa reittien `src/app/api/tiedonsiirto/{vienti,pohja,tuonti}` kautta. Logiikka on kansiossa `src/lib/tiedonsiirto/`:
  - `kohteet.ts`: kohteet riippuvuusjärjestyksessä. **Kun lisäät malliin kentän tai uuden mallin, päivitä myös sen kohde**, muuten kenttä ei kulje tuonnissa eikä viennissä.
  - `tuonti.ts`: tuontimoottori. Yksi transaktio, rivikohtainen savepoint, ja esikatselu perii transaktion lopuksi.
  - `arvot.ts`: arvojen tulkinta ja muotoilu. Tyhjä solu tarkoittaa, ettei kenttään kosketa.

  Tuonti ei koskaan poista rivejä.

### Ulkoasu: Wodulen brändi-ilme

Ulkoasu noudattaa wodule.fi:n ilmettä. Värit ovat CSS-muuttujina tiedostossa `src/app/globals.css` (vaalea ja tumma teema) ja Tailwind-väreinä (`ink`, `accent`, `brand-dark` jne.). Älä kovakoodaa värejä sivuille.
- Painikkeet: `btn btn-primary` (oranssi, päätoiminto), `btn btn-secondary` (tumman vihreä), `btn btn-ghost` ja pieni koko `btn-sm`. Kentät: `field`. Kortit: `card`. Tilamerkit: `badge ok|crit|muted|info`.
- Fontit: `font-heading` (Chakra Petch) otsikoihin, oletuksena Reddit Sans ja `font-mono` (Reddit Mono). h1 on automaattisesti isoin kirjaimin.
- Logo on komponentissa `src/components/WoduleLogo.tsx` (väri `currentColor`). Sivupalkki (`SectionNav.tsx`) on client-komponentti, joka korostaa aktiivisen reitin.
- Tailwind 3 ei tue läpinäkyvyysmodifikaattoreita (`/70`) CSS-muuttujaväreille. Käytä kiinteää arvoa, esim. `text-[#f0e7d5]/70`.

Rahasummat tallennetaan kokonaislukuina sentteinä (esim. `amountCents`). Lomakkeisiin syötetään euroja, jotka muunnetaan senteiksi.

### Tuotantoaikataulun laskenta: älä muuta toimintaa

`src/lib/production-schedule.ts` on suora portaus aiemmasta, tuotannossa validoidusta Artifact-työkalusta, ja kaavat on tarkoituksella pidetty identtisinä:
- Rivit ketjutetaan `seq`-järjestyksessä. Rivin aloitus on joko sen oma kiinteä `aloitus` tai edellisen rivin ennuste + `siirto` **kalenteripäivää** (ei työpäivää).
- Ennuste lasketaan funktiolla `ennusteFromAloitusKesto`, joka vastaa Excelin kaavaa `WORKDAY.INTL(aloitus, kesto, 1) - 1`. Työpäiviä ovat ma–pe.
- **`kesto` on ainoa aikataulua ohjaava kenttä.** `laskennallinenKesto` (tuntimenekki / ((työntekijöitä / työpisteitä) × 7,5)) on pelkkä vertailuluku. Se ei saa koskaan syöttää arvoa `kesto`-kenttään eikä ennusteeseen.

### Kaksi eri "aikataulua": älä sekoita

- **`ProductionScheduleItem`** ("Tuotantoaikataulu projektit") on koko tuotannon Gantt, jonka laskenta kuvataan yllä. Se kuuluu osioon Asiakkuuksien hallinta > Projektit, **ei** Tuotannon ohjaukseen.
- **`ScheduleTask`** ("Projektiaikataulu", `/asiakkuuksien-hallinta/projektit/[id]/aikataulu`) on yhden projektin tehtäväaikataulu projektinhallinnan Excelin mallilla: tehtävällä on tunnus (T1, T2, …) ja edeltäjä tunnuksena (`predecessorCode`, ei viiteavain). Laskenta on tiedostossa `src/lib/projektiaikataulu.ts`. Se käyttää production-schedule.ts:n funktioita, mutta ei saa muuttaa niitä. Samalla sivulla ovat asiakkaalle näkyvät virstanpylväät (`ProjectMilestone`). Projektiaikataulu ei ole kytköksissä tuotannon Ganttiin.

### Projektinhallinta: aikataulu → hankinnat → tehtäväluettelo

Lähde on projektinhallinnan Excel (Firstcamp iglut: välilehdet aikataulu ja Hankintasuunnitelma), ja sen kaavat on toteutettu samoina:
- `ProcurementItem.scheduleTaskCode` viittaa aikataulutehtävään. Toimituspäivä on tehtävän laskettu aloitus, tai `neededBy`, jos tehtävää ei ole.
- Vaiheiden takarajat lasketaan toimituspäivästä taaksepäin **kalenteripäivinä** (`src/lib/hankinta.ts`). Testit `src/lib/projektiaikataulu.test.ts` tarkistavat ne Excelin laskemia arvoja vasten.
- `phase` etenee järjestyksessä Aineisto → Pyyntö → Tarjous → Vertailu → Sopimus → Toimitus → Valmis (tai Ei tarvita). Tehtäväluettelo (`/projektit/[id]/tehtavat`) näyttää nykyisen vaiheen takarajan, ja siinä on mukana myös omat tehtävät (`ProjectTodo`). Luettelon voi ryhmitellä henkilöittäin (`User`, `/henkilot`).
- Tiedonsiirto tuo projektin Excel-välilehdet sellaisenaan: otsikkorivi ja välilehti tunnistetaan automaattisesti, ja projekti annetaan oletusarvona (`oletukset`).

Projektinhallinnan Server Actions (`src/lib/actions/projektinhallinta.ts`) palaavat lomakkeen `paluu`-kentän osoitteeseen. Virheet välitetään `?virhe=`-parametrina, jonka sivu näyttää `<Virhe>`-komponentilla. Muokkauslomake avataan parametrilla `?muokkaa=<id>`.

Tuotannon ohjaus on oma osionsa: jokaisella projektilla on Sharepoint-tuotantokansio (`ProductionFolder`), jonka alla ovat työmääräimet (`WorkOrder`) ja piirustukset (`Drawing`).

## Tunnetut puutteet (tarkoituksellisia, ks. README:n Jatkokehitys-osio)

- `User` on henkilörekisteri, jonka henkilöille jaetaan tehtäviä, mutta kirjautumista ei ole. Kuka tahansa voi muokata mitä tahansa.
- Tiedostot (`QaDocument`, `Drawing`, tarjousten liitteet) ovat pelkkiä `fileUrl`-tekstikenttiä. `ProductionFolder.sharepointUrl` on pelkkä linkki; Microsoft Graph -integraatiota ei ole.
- `TuotantoaikatauluClient.tsx`:n Gantt on yksinkertaistettu: ei kuukausi- tai viikko-otsikoita, ja tooltipit ovat pelkkiä `title`-attribuutteja.
- Validointityyli on epäyhtenäinen: rajapintareiteillä jaetut skeemat `validation.ts`:ssä, Server Actionseissa inline-zod.
