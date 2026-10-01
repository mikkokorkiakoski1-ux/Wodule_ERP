# Arkkitehtuuri

Tämä sovellus on toteutettu suoraan liitteenä olleen sivukartta-/rakennekaavion
(`docs/rakennekaavio.jpg`) mukaan. Kaavio on ainoa lähde sille, mitä osioita ja
alasivuja järjestelmässä on - jos rakenne muuttuu, päivitä ensin kaavio, sitten
tämä taulukko ja `src/components/SectionNav.tsx`.

## Teknologiavalinnat

- **Next.js 14 (App Router) + TypeScript** - yksi koodikanta UI:lle ja API:lle.
- **PostgreSQL + Prisma** - tietomalli `prisma/schema.prisma`, ajetaan Dockerilla
  paikallisesti (`docker-compose.yml`).
- **Tailwind CSS** + Wodulen brändi-ilme (wodule.fi): tumma vihreä, oranssi
  korostusväri, vaalea ruskea tausta, Chakra Petch- ja Reddit Sans -fontit sekä
  viistetyt kulmat. Värit ovat CSS-muuttujina `globals.css`:ssä (vaalea ja
  tumma teema), ja yhteiset luokat `.btn`, `.btn-primary`, `.btn-secondary`,
  `.btn-ghost`, `.field`, `.card` ja `.badge` ovat samassa tiedostossa. Käytä
  niitä uusilla sivuilla. Logo on komponentissa `WoduleLogo.tsx`.
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
| &nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;├─ Yhteenvetosivu | `/asiakkuuksien-hallinta/projektit/[id]` | koostesivu + `ProjectMember` (projektiorganisaatio) |
| &nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;├─ Projektiaikataulu | `/asiakkuuksien-hallinta/projektit/[id]/aikataulu` | `ScheduleTask`, `ProjectMilestone` |
| &nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;├─ Hankintasuunnitelma | `/asiakkuuksien-hallinta/projektit/[id]/hankintasuunnitelma` | `ProcurementPlan`, `ProcurementItem` |
| &nbsp;&nbsp;&nbsp;│&nbsp;&nbsp;└─ *Tehtäväluettelo (ei kaaviossa)* | `/asiakkuuksien-hallinta/projektit/[id]/tehtavat` | `ProjectTodo` + `ProcurementItem` |
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
| Henkilöt (henkilörekisteri) | `/henkilot`, `/henkilot/[id]` (henkilön tehtävät kaikista projekteista) | `User` |
| Tiedonsiirto (tuonti ja vienti) | `/tiedonsiirto`, `/api/tiedonsiirto/{vienti,pohja,tuonti}` | kaikki yllä olevat + `DataTransferLog` |

Projektin alasivuilla on yhteinen layout (`projektit/[projektiId]/layout.tsx`):
otsikko ja välilehdet Yhteenveto, Projektiaikataulu, Hankintasuunnitelma ja
Tehtäväluettelo. Tehtäväluettelo ei ole kaavion solmu. Jos se halutaan
kaavioon, `docs/rakennekaavio.jpg` pitää päivittää käsin.

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
- **Projektiaikataulu** (yksittäisen projektin alla) on projektin oma
  tehtäväaikataulu (`ScheduleTask`), joka vastaa projektinhallinnan Excelin
  aikataulu-välilehteä: tehtävällä on tunnus (T1, T2, ...) ja edeltäjä
  tunnuksena, ja kaavat ovat samat kuin tuotantoaikataulussa
  (`src/lib/projektiaikataulu.ts` käyttää production-schedule.ts:n funktioita
  muuttamatta niitä). Samalla sivulla ovat asiakkaalle näkyvät virstanpylväät
  (`ProjectMilestone`). Projektiaikataulu ei ole kytköksissä tuotannon
  Ganttiin.

**Hankintasuunnitelma ja aikataulu on kytketty:** hankintarivi
(`ProcurementItem.scheduleTaskCode`) viittaa aikataulutehtävään, jonka
aloitus on toimituspäivä. Siitä lasketaan taaksepäin vaiheiden takarajat
(`src/lib/hankinta.ts`: sopimus = toimitus - toimitusaika, vertailu = sopimus
- neuvottelut, tarjous = vertailu - vertailuaika, pyyntö = tarjous -
pyyntöaika, aineisto = pyyntö - keräys). Rivi etenee vaiheittain (Aineisto ->
Pyyntö -> Tarjous -> Vertailu -> Sopimus -> Toimitus -> Valmis), ja
tehtäväluettelo näyttää nykyisen vaiheen takarajan vastuuhenkilöittäin.

## Kansiorakenne

```
src/
  app/                      # Next.js App Router -reitit (yksi kansio per kaavion solmu)
  lib/
    prisma.ts               # Prisma-clientin singleton
    production-schedule.ts  # Tuotantoaikataulun laskentalogiikka (portattu Artifactista)
    projektiaikataulu.ts    # Projektiaikataulun laskenta (edeltäjät tunnuksina)
    hankinta.ts             # Hankintojen vaiheet ja takarajat
    projektinhallinta.ts    # Aikataulun, hankintojen ja tehtäväluettelon tiedonhaku
    validation.ts           # Zod-skeemat API-reiteille
    actions/                # Server Actions per osio (asiakkuudet, tuotehallinta, ...)
    tiedonsiirto/           # Tuonti ja vienti: kohteet, tiedostomuodot, tuontimoottori
  components/
    SectionNav.tsx           # Sivunavigaatio - peilaa kaaviota
    TuotantoaikatauluClient.tsx  # Tuotantoaikataulun interaktiivinen taulukko/Gantt
    TiedonsiirtoTuontiClient.tsx # Tuonnin esikatselu ja tallennus
    ProjektinValilehdet.tsx  # Projektin alasivujen välilehdet
    Tehtavalista.tsx         # Tehtäväluettelon taulukko (projekti ja henkilö)
    projektinhallinta.tsx    # Projektisivujen yhteiset palat (takaraja, virhe, Excel-tuonti)
prisma/
  schema.prisma
  seed.ts                   # Siemendata, mm. sama 11 riviä kuin Artifact-työkalussa
docs/
  rakennekaavio.jpg         # Alkuperäinen liitteenä ollut kaavio
  ARKKITEHTUURI.md          # Tämä tiedosto
```
