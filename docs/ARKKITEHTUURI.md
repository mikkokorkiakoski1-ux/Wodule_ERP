# Arkkitehtuuri

Tämä sovellus on toteutettu suoraan liitteenä olleen sivukartta-/rakennekaavion
(`docs/rakennekaavio.jpg`) mukaan. Kaavio on ainoa lähde sille, mitä osioita ja
alasivuja järjestelmässä on - jos rakenne muuttuu, päivitä ensin kaavio, sitten
tämä taulukko ja `src/components/SectionNav.tsx`.

## Teknologiavalinnat

- **Next.js 14 (App Router) + TypeScript** - yksi koodikanta UI:lle ja API:lle.
- **PostgreSQL + Prisma** - tietomalli `prisma/schema.prisma`, ajetaan Dockerilla
  paikallisesti (`docker-compose.yml`).
- **Tailwind CSS** - sama visuaalinen kieli (väriteemat, IBM Plex -fontit) kuin
  aiemmin rakennetussa Tuotantoaikataulu-Artifact-työkalussa, ks. `globals.css`.
- **Server Actions** useimpiin CRUD-lomakkeisiin (yksinkertaisin tapa Next.js
  App Routerissa). **Tuotantoaikataulu projektit** -osio on poikkeus: se on
  client-komponentti, joka kutsuu omia REST-reittejään
  (`src/app/api/tuotantoaikataulu/**`), koska se tarvitsee saman interaktiivisen
  taulukko/Gantt-käyttökokemuksen kuin alkuperäinen Artifact-työkalu (lisäys,
  muokkaus, järjestyksen vaihto ilman koko sivun uudelleenlatausta).
- **Ei vielä kirjautumista.** `User`-malli on olemassa skeemassa, mutta mitään
  ei ole vielä kytketty siihen. Tämä on tarkoituksella jätetty Claude Coden
  jatkokehitykseen (ks. juuren `README.md` roadmap-osio).

## Kaavio -> toteutus -vastaavuustaulukko

| Kaavion solmu | Reitti | Prisma-malli(t) |
|---|---|---|
| Pääikkuna | `/` | (koosteen laskee useasta mallista) |
| Asiakkuuksien hallinta | `/asiakkuuksien-hallinta` | `Customer` |
| ├─ Tarjoukset | `/asiakkuuksien-hallinta/tarjoukset` | `Offer` |
| └─ Projektit | `/asiakkuuksien-hallinta/projektit` | `Project` |
| &nbsp;&nbsp;&nbsp;├─ Tilausvahvistus | `/asiakkuuksien-hallinta/projektit/[id]` (Yhteenvetosivu-alla) | `OrderConfirmation` |
| &nbsp;&nbsp;&nbsp;├─ Tuotantoaikataulu projektit | `/asiakkuuksien-hallinta/projektit/tuotantoaikataulu` | `ProductionScheduleItem` |
| &nbsp;&nbsp;&nbsp;├─ Projekti 1, Projekti 2, ... | `/asiakkuuksien-hallinta/projektit/[id]` | `Project` (yksi rivi per projekti) |
| &nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;├─ Yhteenvetosivu | `/asiakkuuksien-hallinta/projektit/[id]` | koostesivu |
| &nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;├─ Projektiaikataulu | `/asiakkuuksien-hallinta/projektit/[id]/aikataulu` | `ProjectMilestone` |
| &nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;└─ Hankintasuunnitelma | `/asiakkuuksien-hallinta/projektit/[id]/hankintasuunnitelma` | `ProcurementPlan`, `ProcurementItem` |
| Tuotehallinta | `/tuotehallinta` | - |
| ├─ Nimikkeistö (Tuote1, Tuote2, ...) | `/tuotehallinta/nimikkeisto` | `Product` |
| └─ Hinnastot | `/tuotehallinta/hinnastot` | `PriceList`, `PriceListItem` |
| Reklamaatiot | `/reklamaatiot` | `Complaint` |
| Laadunvarmistus | `/laadunvarmistus` | - |
| ├─ Tarkastuslistat | `/laadunvarmistus/tarkastuslistat` | `QaChecklist`, `QaChecklistItem` |
| └─ Dopit | `/laadunvarmistus/dopit` | `QaDocument` |
| Tuotannon ohjaus | `/tuotannon-ohjaus` | - |
| └─ Sharepoint tuotantokansio (per projekti) | `/tuotannon-ohjaus/[id]` | `ProductionFolder` |
| &nbsp;&nbsp;&nbsp;├─ Työmääräimet | `/tuotannon-ohjaus/[id]/tyomaaraimet` | `WorkOrder` |
| &nbsp;&nbsp;&nbsp;└─ Piirustukset | `/tuotannon-ohjaus/[id]/piirustukset` | `Drawing` |

**Kaavion ulkopuoliset työkalut** (navigaatiossa omana Järjestelmä-ryhmänään):

| Työkalu | Reitti | Prisma-malli(t) |
|---|---|---|
| Tiedonsiirto (tuonti ja vienti) | `/tiedonsiirto`, `/api/tiedonsiirto/{vienti,pohja,tuonti}` | kaikki yllä olevat + `DataTransferLog` |

Tiedonsiirto tuo ja vie kaikkien viiden osion tietoja (CSV, Excel, JSON).
Jokainen tuotava tietotyyppi on "kohde" tiedostossa
`src/lib/tiedonsiirto/kohteet.ts`: sarakkeet, vienti ja yhden rivin tuonti.
Uuden mallin saa tuonnin ja viennin piiriin lisäämällä sille kohteen.
Viittaukset kulkevat luettavilla avaimilla (asiakkaan nimi tai Y-tunnus,
nimikekoodi, projektin nimi), eivät tietokantatunnisteilla. Tuonti ajetaan
yhdessä transaktiossa, ja jokainen rivi on oma savepointinsa. Esikatselu
ajaa saman tuonnin ja perii sen lopuksi.

**Huomio kaavion kahdesta aikataulusta**, koska ne on helppo sekoittaa:

- **Tuotantoaikataulu projektit** (Asiakkuuksien hallinta > Projektit alla) on
  koko tuotannon läpimenoa ohjaava, tarkka viikko/päivätason Gantt-aikataulu.
  Tämä on suoraan portattu aiemmasta Artifact-työkalusta
  (`src/lib/production-schedule.ts`) - kesto/ennuste-kaavat ja
  "Laskennallinen kesto" -tukikenttä ovat identtiset.
- **Projektiaikataulu** (yksittäisen projektin alla) on kevyempi,
  asiakkaalle suunnattu virstanpylväslista (`ProjectMilestone`), eri malli ja
  eri sivu.

## Kansiorakenne

```
src/
  app/                      # Next.js App Router -reitit (yksi kansio per kaavion solmu)
  lib/
    prisma.ts               # Prisma-clientin singleton
    production-schedule.ts  # Tuotantoaikataulun laskentalogiikka (portattu Artifactista)
    validation.ts           # Zod-skeemat API-reiteille
    actions/                # Server Actions per osio (asiakkuudet, tuotehallinta, ...)
    tiedonsiirto/           # Tuonti ja vienti: kohteet, tiedostomuodot, tuontimoottori
  components/
    SectionNav.tsx           # Sivunavigaatio - peilaa kaaviota
    TuotantoaikatauluClient.tsx  # Tuotantoaikataulun interaktiivinen taulukko/Gantt
    TiedonsiirtoTuontiClient.tsx # Tuonnin esikatselu ja tallennus
prisma/
  schema.prisma
  seed.ts                   # Siemendata, mm. sama 11 riviä kuin Artifact-työkalussa
docs/
  rakennekaavio.jpg         # Alkuperäinen liitteenä ollut kaavio
  ARKKITEHTUURI.md          # Tämä tiedosto
```
