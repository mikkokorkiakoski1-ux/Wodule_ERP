# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projekti

Sisäinen toiminnanohjausjärjestelmä (ERP). Tekniikka: Next.js 14 (App Router) + TypeScript, PostgreSQL + Prisma, Tailwind. Käyttöliittymä, reittien nimet, mallien kommentit ja dokumentaatio ovat **suomeksi**. Kirjoita myös uudet käyttäjälle näkyvät tekstit, reittisegmentit, kommentit ja dokumentaatio suomeksi.

## Komennot

```bash
npm install
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

Testikehys on Vitest. Testit ovat testattavan tiedoston vieressä (`*.test.ts`). Toistaiseksi testattu on vain `src/lib/production-schedule.ts`. Sen testit lukitsevat alkuperäisen laskennan toiminnan, joten hajoava testi tarkoittaa yleensä kiellettyä laskennan muutosta.

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

Rahasummat tallennetaan kokonaislukuina sentteinä (esim. `amountCents`). Lomakkeisiin syötetään euroja, jotka muunnetaan senteiksi.

### Tuotantoaikataulun laskenta: älä muuta toimintaa

`src/lib/production-schedule.ts` on suora portaus aiemmasta, tuotannossa validoidusta Artifact-työkalusta, ja kaavat on tarkoituksella pidetty identtisinä:
- Rivit ketjutetaan `seq`-järjestyksessä. Rivin aloitus on joko sen oma kiinteä `aloitus` tai edellisen rivin ennuste + `siirto` **kalenteripäivää** (ei työpäivää).
- Ennuste lasketaan funktiolla `ennusteFromAloitusKesto`, joka vastaa Excelin kaavaa `WORKDAY.INTL(aloitus, kesto, 1) - 1`. Työpäiviä ovat ma–pe.
- **`kesto` on ainoa aikataulua ohjaava kenttä.** `laskennallinenKesto` (tuntimenekki / ((työntekijöitä / työpisteitä) × 7,5)) on pelkkä vertailuluku. Se ei saa koskaan syöttää arvoa `kesto`-kenttään eikä ennusteeseen.

### Kaksi eri "aikataulua": älä sekoita

- **`ProductionScheduleItem`** ("Tuotantoaikataulu projektit") on koko tuotannon Gantt, jonka laskenta kuvataan yllä. Se kuuluu osioon Asiakkuuksien hallinta > Projektit, **ei** Tuotannon ohjaukseen.
- **`ProjectMilestone`** ("Projektiaikataulu", `/asiakkuuksien-hallinta/projektit/[id]/aikataulu`) on erillinen ja kevyempi: yhden projektin asiakkaalle näkyvät virstanpylväät. Se ei ole kytköksissä tuotannon Ganttiin.

Tuotannon ohjaus on oma osionsa: jokaisella projektilla on Sharepoint-tuotantokansio (`ProductionFolder`), jonka alla ovat työmääräimet (`WorkOrder`) ja piirustukset (`Drawing`).

## Tunnetut puutteet (tarkoituksellisia, ks. README:n Jatkokehitys-osio)

- `User` ja `UserRole` ovat skeemassa, mutta mikään ei vielä käytä niitä, joten kirjautumista ei ole.
- Tiedostot (`QaDocument`, `Drawing`, tarjousten liitteet) ovat pelkkiä `fileUrl`-tekstikenttiä. `ProductionFolder.sharepointUrl` on pelkkä linkki; Microsoft Graph -integraatiota ei ole.
- `TuotantoaikatauluClient.tsx`:n Gantt on yksinkertaistettu: ei kuukausi- tai viikko-otsikoita, ja tooltipit ovat pelkkiä `title`-attribuutteja.
- Validointityyli on epäyhtenäinen: rajapintareiteillä jaetut skeemat `validation.ts`:ssä, Server Actionseissa inline-zod.
